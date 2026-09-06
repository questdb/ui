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
- Out of scope: login page; palette retune of `authBackdrop`; inner LiteEditor. Plain `MessageBubble` follows later the same day.
- For Emre: AI action cards are not login chrome. Light fill is `surfaceValue`.

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

### 2026-09-01 — Results action bar owns the pane-top hairline
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderSubtle` (values unchanged)
- Binding: Result `Actions` gains `border-top` `borderSubtle`. Log `Notifications` wrapper drops `border-bottom` so log + action bar do not stack two lines. Action bar `border-bottom` (to the grid) stays.
- Neighbors: same weight as other panel-to-work edges (schema wrapper, drawer, allotment sash). Rails stay `borderDefault`.
- Walked: SQL results with schema open (action bar meets sidebar), log expanded and collapsed, grid and chart.
- Why: Schema lives only in the top pane. The results bar spans full width under it; without a top edge the two `surfaceRaised` panels fused.
- Out of scope: notebook `ResultActionsBar` (inside a cell, not against the schema).
- For Emre: The results pane's top hairline belongs on the action bar, not the log, because the log does not span under the sidebar.

### 2026-09-01 — Light scrollbar thumb follows the surface ladder
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `scrollbarThumb`
- Before → after (light): `#62656b` → `#c5cad3`
- Neighbors: sits between `borderDefault` (ink `.15`) and `borderStrong` `#828b99`. Dark thumb stays white `.13`.
- Walked: search list, result grid, AI chat, news drawer.
- Why: The old thumb was charcoal on the lifted light surfaces, so every overflow read as a dark rail.
- Out of scope: dark thumb (already white `.13`). Monaco slider rebound in a later entry.
- For Emre: Light scrollbars are chrome, not content. Do not reuse `contentDisabled`.

### 2026-09-01 — Light rails, results pane, and webkit scrollbars
- Lift: binding
- Status: applied locally
- Modes: light (rails/footer); both (results, news, webkit)
- Tokens: `surfaceRaised`, `scrollbarThumb`, `borderSubtle` (values unchanged except the thumb palette above)
- Binding:
  - Icon rails (`Sidebar`) and footer: light `surfaceBase` → `surfaceRaised`. Dark rails stay `surfaceBase`.
  - Result pane `Root` + `PaneContent`: `surfaceBase` → `surfaceRaised` (same as log, action bar, schema, AI).
  - News list fill: `surfaceBase` → `surfaceRaised`; row rules `surfaceRaised` → `borderSubtle` so they do not vanish.
  - Global `::-webkit-scrollbar` now paints `scrollbarThumb` (Firefox already used `scrollbar-color`).
- Neighbors: light chrome frame is one fill (`surfaceRaised` `#f4f5f7`) against work (`surfaceValue` / grid). Stagger is the `borderDefault` rail hairline, not a darker grey.
- Walked: left nav vs results, right nav vs AI, search overflow, grid overflow, footer.
- Why: Rails and the results well were still on `surfaceBase` after content panels moved up, so the grey frame looked unthemed. Chrome/Safari never read `scrollbar-color`.
- Out of scope: TopBar (still `surfaceBase`); editor `PaneWrapper`; checkboxes; `surfaceBase` palette.
- For Emre: Light icon rails share the panel fill. Dark still recedes (`surfaceBase`). Webkit thumbs are a global chrome rule.

### 2026-09-01 — Run-query menu divider stays a hairline on hover
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderSubtle`, `interactionHover`, `surfaceOverlay` (values unchanged)
- Binding: `ButtonBar` dropdown was a one-off (`surfaceInset` + secondary `Button` items). Secondary hover paints `borderStrong`, which recolored the `borderSubtle` item rule in light (`#828b99` on a pale menu). Menu now uses `floatingSurfaceStyles`. Item hover is `interactionHover` and the divider stays `borderSubtle`.
- Neighbors: same recipe as `DropdownMenu` / `SelectMenu`.
- Walked: Run query chevron in light and dark, hover each item.
- Why: The line was not a separate divider component — it was the button hover border winning.
- Out of scope: splitting the items off `Button`; checkboxes.
- For Emre: Menu items that are `Button`s cannot keep the default secondary hover border.

### 2026-09-01 — Monaco scrollbar uses the shared thumb
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `scrollbarThumb` (values unchanged)
- Binding: Monaco overlay slider `interactionNeutral` → `scrollbarThumb`.
- Neighbors: dark `interactionNeutral` `#32343e` happened to match the quiet white thumb; light `#e8eaee` sat on `editorCanvas` `#eef0f3` and disappeared / mismatched webkit `#c5cad3`.
- Walked: SQL editor overflow, both modes.
- Why: Dark already looked themed. Light was the leftover.
- Out of scope: Monaco theme JSON (`dracula.ts` menu separators still `interactionNeutral`).
- For Emre: Editor chrome scrollbars are `scrollbarThumb`, not a list-selection fill.

### 2026-09-01 — Light user chat bubbles lift off the panel
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: `surfaceValue`, `borderDefault` (values unchanged)
- Binding: plain `MessageBubble` fill `authBackdrop` → `surfaceValue` in light. Dark stays `authBackdrop`. Border was already `borderDefault`.
- Neighbors: chat panel `surfaceRaised` `#f4f5f7`. Bubble `#ffffff` + `borderDefault` (ink `.15`). Same as `UserRequestBox`.
- Walked: typed user message in the AI panel, light mode. Dark unchanged.
- Why: `authBackdrop` light `#c7cbd2` recedes on the raised panel. Lighter-on-light needs `surfaceValue`.
- Out of scope: assistant reply (not a bubble); composer; login `authBackdrop`.
- For Emre: User chat chrome in light is `surfaceValue` + `borderDefault`, not the login well.

### 2026-09-01 — Light ghost hover recedes, not lifts
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: `interactionHover` (values unchanged)
- Binding: ghost `Button` hover used `surfaceRaised`. On tab-rail / chat-header chrome that is already `surfaceRaised` (or close), hover lifted toward white. Light hover is now `interactionHover` (ink wash, same as Add metrics / Select). Dark still `surfaceRaised`.
- Neighbors: `SegmentedControlButton` hover is already `interactionHover`. Cell maximize/more still override light hover to `surfaceBase` on raised cells.
- Walked: Add New, Tab History, Tab Settings (SQL tab rail + AI header).
- Why: Ghost on grey chrome must darken. `surfaceRaised` is an elevation step, not a hover wash.
- Out of scope: dark ghost; pressed History chip (`surfaceRaised` + `borderDefault`).
- For Emre: Light ghost hover is the inverting overlay, not a surface lift.

### 2026-09-01 — Schema toolbar: 2px gap between action chips
- Lift: binding (layout)
- Status: applied locally
- Modes: both
- Binding: Schema header `Box` around Add metrics / Select / Auto refresh `gap="0"` → `gap="0.2rem"` (2px at the 10px rem root).
- Walked: tables panel with auto-refresh on, hover Select.
- Why: Hover fills were flush, so Select fused with the active refresh chip.
- Out of scope: other `gap="0"` toolbars.
- For Emre: Spacing only; tokens unchanged.

### 2026-09-01 — Light `borderStrong` quieter for activated controls
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `borderStrong`
- Before → after (light): `#828b99` → `#b0b7c2`. Dark unchanged `#3d414d`.
- Neighbors: rest stroke is `borderDefault` (ink `.15` ≈ `#dddfe2` on white). Activated hover/open/focus still steps up, but not to charcoal. `gridFocus` stays `#828b99` — denser grid ring, not the chrome stroke.
- Walked: AI model SelectMenu open, Download as Parquet hover, cell Auto Refresh SelectMenu, Filter/Search fields on focus, ThemeModeSelector open.
- Why: Activated chrome stroke was jumping the scale. Same role (`borderStrong`) — the light value was too heavy.
- Out of scope: dark; brand accent fields (`$tone="accent"`); `gridFocus`.
- For Emre: Light `borderStrong` is now the quiet activated control stroke. Keyboard outlines, sash hover, checkbox rest, and segmented-control track also inherit. Flag if those jobs need to stay at the old `#828b99` (would then be a new role, not this one).

### 2026-09-01 — Chat history hover matches dropdown items
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: `interactionHover` (values unchanged)
- Binding: `ChatHistoryItem` hover `surfaceBase` → `interactionHover` in light. Dark stays `surfaceInput`.
- Neighbors: dropdown / schema-tree / search-row hover is `interactionHover`, not a surface. `surfaceBase` `#eef0f3` on a `surfaceRaised` `#f4f5f7` panel was a solid step and read as a different family.
- Walked: AI chat history list, light mode.
- Why: Same job as a menu item hover. Not a surface, and not one step lighter — the ink wash.
- Out of scope: dark (still a solid recede on the raised panel); selected/"Current" treatment (text only).
- For Emre: List-row hover is `interactionHover` in light. Do not invent a lighter surface for this.

### 2026-09-01 — Light scrollbar thumb one notch quieter
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `scrollbarThumb`
- Before → after (light): `#c5cad3` → `#d2d6de`. Dark unchanged (`white` `.13`).
- Neighbors: still darker than `surfaceRaised` `#f4f5f7` / `surfaceCanvas` `#e8eaee`, quieter than `borderStrong` `#b0b7c2`. Webkit, Firefox `scrollbar-color`, and Monaco overlay all read this token.
- Walked: schema tree, editor, AI panel overflows.
- Why: After the surface lift the thumb still sat a bit heavy. One step toward the chrome, not a new role.
- Out of scope: dark; track (stays transparent).
- For Emre: Same `scrollbarThumb` role. Light value only.

### 2026-09-01 — Chrome-tabs plus hover is the ghost leftover
- Lift: binding
- Status: applied locally
- Modes: light
- Tokens: `interactionHover` (values unchanged)
- Binding: `.new-tab-button:hover` in `_react-chrome-tabs.scss` used `surfaceRaised`, more specific than the ghost `Button` rule. Light hover → `interactionHover`. Dark still `surfaceRaised`.
- Neighbors: same wash as tab-rail History / Settings ghosts and Add metrics.
- Walked: SQL tab bar plus in light.
- Why: The plus is not an `IconButton`; chrome-tabs owns its hover in SCSS.
- Out of scope: tab close / edit chip hovers (still `surfaceRaised`); pressed History chip.
- For Emre: Chrome-tabs plus is ghost chrome. Do not let SCSS reintroduce a surface lift.

### 2026-09-01 — Light scrollbar thumb into stone, not a cooler neighbor
- Lift: palette
- Status: tweaked (too warm; see following entry)
- Modes: light
- Tokens: `scrollbarThumb`
- Before → after (light): `#d2d6de` → `#ddd8d1`. Dark unchanged.
- Neighbors: no warm chrome role to borrow. Surfaces, controls, and `borderStrong` are all cool blue-gray.
- Why: The previous notch was not visible. Hue shift was noticeable, but too warm.

### 2026-09-01 — Light scrollbar thumb cooler, still a real step
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `scrollbarThumb`
- Before → after (light): `#ddd8d1` → `#d7dbe3`. Dark unchanged.
- Neighbors: same cool family as `surfaceCanvas` `#e8eaee` and `borderStrong` `#b0b7c2`. Lighter than the original `#c5cad3`, cooler than the stone miss.
- Walked: schema, editor, AI overflows.
- Why: Stone was too warm. Stay on the cool ladder; take a larger lightness step than `#d2d6de` so it still reads quieter.
- Out of scope: dark.
- For Emre: Light thumb is cool chrome, not stone. `#c5cad3` → `#d7dbe3`.

### 2026-09-01 — Provider choice cards go neutral
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `interactionHover`, `interactionNeutral`, `borderDefault` (values unchanged)
- Binding: `SelectableCardButton` hover `borderAccent` / `interactionAccentHover` → `borderDefault` / `interactionHover`. Selected `borderAccent` / `interactionAccentActive` / inset accent ring → `interactionNeutral` + `borderDefault` (same as list selected).
- Neighbors: AI setup provider cards and Add Metric type cards share this component.
- Walked: Add a model provider (OpenAI / Anthropic / Custom), both modes.
- Why: Choice cards are chrome selection, not a brand action.
- Out of scope: `TabButton` underlines (still branded); composer `$tone="accent"`.
- For Emre: Large-target selected cards match list selected, not accent.

### 2026-09-01 — Multi-step pill gets a visible hairline
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderDefault` (values unchanged)
- Binding: `StepIndicatorContainer` had only `shadowSubtle`. Add `borderDefault` so the capsule reads on the modal.
- Neighbors: modal itself is `borderDefault`. Inner step name chip stays `interactionNeutral`.
- Walked: Add a model provider step pill, light and dark.
- Why: Shadow alone disappeared, especially in dark. `borderSubtle` would still vanish; `borderDefault` is the visible-subtle step.
- Out of scope: pill fill.
- For Emre: Step chrome uses the same stroke as the modal edge.

### 2026-09-01 — Status badges are chips; count badges stay pills
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `statusSuccessSurface`, `statusDangerSurface`, `statusWarningSurface`, `statusInfoSurface`, `interactionNeutral` (values unchanged here)
- Binding: `Badge` default `shape="chip"` — 4px radius, 5px padding, 400/11px, no border, status surface fills. `shape="pill"` keeps the old stadium + 10%/32% wash. `TabBadge` (Monitoring warning/error counts) is pinned to `pill`.
- Neighbors: AI Validated chip, import file-status, Type/Trend badges, “New”, version/EE badges inherit chip. Monitoring tab count must not.
- Walked: Assistant Settings Validated chip; table details Monitoring tab.
- Why: Figma status chips are rounded rects on a status well, not stadium pills. Count badges on tabs are a different job.
- Out of scope: sidebar Enabled/Inactive (`StatusChip`, not `Badge`).
- For Emre: Two shapes on one primitive. Pill is the compact count. Chip is the status label.

### 2026-09-01 — Light success wells denser so chips read
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `statusSuccessSurface`
- Before → after (light): `rgba(8, 122, 80, 0.1)` → `rgba(8, 122, 80, 0.16)`. Dark unchanged.
- Neighbors: `statusSuccess` `#067047` / `statusSuccessBorder` `.28`. Sits on `surfaceOverlay` `#fafbfc` and selected `interactionNeutralHover` `#e2e5ea`.
- Walked: Assistant Settings Enabled chip and Validated chip, light mode.
- Why: `.10` washed out on the new light ladder. Typical light success chips need a denser well.
- Out of scope: dark success surface; danger/warning/info surfaces.
- For Emre: Light success fill is the chip/banner well. `.16` is still a wash, not a solid green-100.

### 2026-09-01 — Light Enabled chip uses the success well
- Lift: binding
- Status: applied locally
- Modes: light (dark unchanged)
- Tokens: `statusSuccessSurface`, `statusSuccessBorder`, `surfaceValue`, `borderDefault` (values as above)
- Binding: sidebar `StatusChip` Enabled was `interactionNeutral` in both modes — same as the selected provider row (`interactionNeutralHover`) in light, so the chip vanished. Light Enabled → `statusSuccessSurface` + `statusSuccessBorder`. Light Inactive → `surfaceValue` + `borderDefault`. Dark stays `interactionNeutral`, no border (Figma).
- Neighbors: selected provider `interactionNeutralHover` `#e2e5ea`. Modal `surfaceOverlay` `#fafbfc`.
- Walked: Assistant Settings sidebar, light, selected Enabled row.
- Why: Light chips need a fill that is not the selected-row gray. Enabled is a success state.
- Out of scope: dark Enabled (already matches Figma); Monitoring `TabBadge`.
- For Emre: Light Enabled is a success chip. Dark Enabled is a neutral well with success type.

### 2026-09-01 — AI settings selected provider is one step quieter
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `interactionNeutral` (values unchanged)
- Binding: `ProviderTab` selected `interactionNeutralHover` → `interactionNeutral`.
- Neighbors: unselected hover stays `controlSurfaceHover`. Modal is `surfaceOverlay`. Tab underline stays `contentAccent`.
- Walked: Assistant Settings sidebar, light.
- Why: Selected row was a notch too heavy on the lifted light ladder. Same interaction role, one step quieter.
- Out of scope: editor/drawer `TabButton` (still `surfaceRaised`).
- For Emre: Vertical provider tabs use the list-selected well, not the hover well.

### 2026-09-01 — Models empty well is inset, not the dialog scrim
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `surfaceInset` (values unchanged)
- Binding: `ModelsPlaceholder` `surfaceScrim` → `surfaceInset`.
- Neighbors: modal `surfaceOverlay` `#fafbfc`; inputs `surfaceInput` `#fafbfc`. Scrim is 32% ink — a backdrop, not a well.
- Walked: Assistant Settings before API key validation, light.
- Why: `surfaceScrim` is occlusion. An empty models region is an embedded well.
- Out of scope: Overlay / docsearch / grid fades still use scrim.
- For Emre: Placeholder copy sits on inset, not the dimmer.

### 2026-09-01 — Models empty well one step heavier
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `surfaceRaised` (values unchanged)
- Binding: `ModelsPlaceholder` `surfaceInset` → `surfaceRaised`.
- Neighbors: modal `surfaceOverlay` `#fafbfc`. Light inset `#f7f8f9` vanished; raised `#f4f5f7` is the next visible well.
- Walked: Assistant Settings Enable Models placeholder, light.
- Why: Inset was a notch too close to the modal. Same empty-well job, one step more present.
- Out of scope: scrim; other inset wells.
- For Emre: Empty models copy on raised, not inset.

### 2026-09-01 — Form selects use the input well
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `surfaceInput` (values unchanged)
- Binding: `SelectMenuControl` trigger was secondary `controlSurface`. Form fields should match `Input` (`surfaceInput`). Toolbar `SelectMenu.Trigger` stays `controlSurface`.
- Neighbors: Provider Type next to Provider Name / Base URL / API Key inputs.
- Walked: Add Custom Provider, light.
- Why: Same row of fields, two fills. Form selects are fields, not toolbar buttons.
- Out of scope: toolbar dropdowns.
- For Emre: `SelectMenuControl` is the form select. Trigger fill is `surfaceInput`.

### 2026-09-01 — Footer Connected mark matches Ingesting
- Lift: binding (geometry)
- Status: applied locally
- Modes: both
- Tokens: `statusSuccess` / `statusDanger` (values unchanged)
- Binding: footer `ConnectionStatus` mark was a circle with success/danger glow. It is now the same rounded-square SVG as Ingesting / Enabled chips (`0.9rem`, 15% radius, 32% stroke).
- Neighbors: MCP / Ingesting marks in the same footer row.
- Walked: footer Connected, light and dark.
- Why: Status marks in one bar should share geometry. Color still carries the state.
- Out of scope: MCP pairing popover; Ingesting internals.
- For Emre: Footer status marks are squares, not dots.

### 2026-09-01 — Provider Type uses the console select
- Lift: binding (control)
- Status: applied locally
- Modes: both
- Binding: Add Custom Provider `Select` (native `<select>`) → `SelectMenuControl`. Fill follows the form-select entry above (`surfaceInput`).
- Neighbors: instance type, import settings, chart axes — same primitive.
- Walked: Add Custom Provider, light, open menu.
- Why: Native OS menu broke the light console. Form fields should share one select.
- Out of scope: leftover native `Select` elsewhere.
- For Emre: Workflow selects are `SelectMenuControl`, not `<select>`.

### 2026-09-02 — Light MCP notebook promo is a solid card
- Lift: binding
- Status: applied locally
- Modes: light
- Tokens: `surfaceValue` (values unchanged)
- Binding: `NotebookMcpPromo` `Container` was unfilled (stage showing through the dashed `contentAccent` stroke). Light fill is now `surfaceValue`. Dark stays transparent.
- Neighbors: notebook stage `surfaceStage`; cells `surfaceRaised`; command chip inside the promo already `surfaceRaised`.
- Walked: notebook MCP promo, light, expanded.
- Why: A dashed outline on the stage read as a hole. The notice is a card, not a well. White sits above the stage and above cells without a new token.
- Out of scope: dark fill; dashed stroke; `New` badge.
- For Emre: Light promo fill is `surfaceValue`. Dark is still the dashed stroke only.

### 2026-09-04 — Switch is larger and squared
- Lift: binding (geometry)
- Status: applied locally
- Modes: both
- Tokens: unchanged (`controlTrack`, `controlKnob`, `contentAccent` / `statusSuccessStrong` on, `contentInverse` thumb)
- Binding: `Switch` track was a 36×20 pill with a 14px circular thumb. Default (`md`) is now 44×20, 6px radius, 1.5px inset, 24px rounded-square thumb (5px radius) — Figma node `1902:32067`. `sm` scales the same language (36×18 / 20px thumb).
- Neighbors: AI Settings model list (the Figma frame); Editor Settings; import settings; schema designated timestamp.
- Walked: Editor Settings switch, light and dark, on and off.
- Why: The pill read as a tiny iOS switch. Squared + longer travel makes the control a row action, not chrome jewelry.
- Out of scope: color retune (still branded on / success tone); checkboxes; Figma’s green-on — we keep current `tone`.
- For Emre: Switch geometry only. Do not copy Figma’s `#19ac43` onto the default accent switch.

### 2026-09-04 — Switch stroke is 0.5px
- Lift: binding (geometry)
- Status: applied locally
- Modes: both
- Binding: `Switch` track stroke is a 0.5px inset `box-shadow` (not `border: 0.5px` — Chromium rounds that used value to 1px even at 2x). Padding is 2px so the hairline plus 1.5px gap still reads as 2px outside-to-thumb. Thumb height/travel stay `md` 16px / 16px.
- Neighbors: same as the squared-switch entry.
- Walked: Editor Settings switch, light, off and on.
- Why: 1px hairline plus 1.5px padding made a 2.5px gutter. Design is 0.5 + 1.5 = 2px outside-to-thumb.
- Out of scope: color; focus outline still 1px.
- For Emre: Switch rest/on stroke is 0.5px. Do not thicken it to match other controls.

### 2026-09-04 — Table and mat-view glyphs are muted
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `contentMuted` (values unchanged)
- Binding: `TableIcon` (and standalone `MaterializedViewIcon`) `contentAccent` → `contentMuted`. Schema row title no longer forces accent onto nested SVGs.
- Neighbors: schema tree, details `TableSelector`, metrics table picker, AI schema chips, “Create materialized view” menu glyph. Rail table-details latch stays `contentAccent` when selected.
- Walked: schema tree + details table select, light.
- Why: Object-type marks were wearing brand. They are labels, not selected chrome.
- Out of scope: rail latches; notebook title glyphs. Column type glyphs: see following entry.
- For Emre: Table / mat-view / view identity icons are `contentMuted`.

### 2026-09-04 — Column metadata glyphs are muted
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `contentMuted` (values unchanged)
- Binding: `ColumnIcon` `TypeIcon` and designated-timestamp `SortDownIcon` `contentAccent` → `contentMuted`.
- Neighbors: schema tree column rows; details Columns list (same `ColumnIcon`).
- Walked: expanded table columns in schema tree, light.
- Why: Same job as table/mat-view marks — type labels, not brand.
- Out of scope: rail latches; copy-pulse highlight still uses `contentAccentStrong`.
- For Emre: Column type icons (including designated timestamp) are `contentMuted`.

### 2026-09-04 — Base-table badge hover in dark
- Lift: binding
- Status: applied locally
- Modes: dark (light already this token)
- Tokens: `interactionHover` (values unchanged)
- Binding: `BaseTableLinkButton` (mat-view Details → Base Table) inherits ghost hover, which is `surfaceRaised` in dark — the same fill as the details drawer, so the wash disappears. Hover is now `interactionHover` in both modes, matching light ghost.
- Neighbors: drawer is `surfaceRaised`. Global dark ghost still `surfaceRaised` (deferred).
- Walked: `bbo_1s` Details, light and dark, hover on `market_data`.
- Why: Light ink wash is visible on raised chrome. Dark elevation hover is not.
- Out of scope: retuning dark `interactionHover`; other ghost buttons.
- For Emre: This badge uses the overlay, not a surface step. Flag if dark ghost should follow globally.

### 2026-09-05 — Light tab rail is raised at 94%
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `surfaceTabRail`
- Before → after (light): `rgba(232, 234, 238, 0.94)` → `rgba(244, 245, 247, 0.94)` (`#F4F5F7` at 94%)
- Neighbors: same RGB as `surfaceRaised` `#f4f5f7`, still the frosted rail (blur + 94%). Dark `rgba(18, 19, 23, 0.82)` unchanged.
- Walked: editor tab strip, light.
- Why: Rail was still the old canvas grey at 94%. Zack wants it to sit with raised chrome.
- Out of scope: dark rail; individual tab pills (still transparent / `interactionHover`).
- For Emre: Light `surfaceTabRail` is now raised-at-94%, not canvas-at-94%.

### 2026-09-05 — Switch on-fill is a unique success fill
- Lift: palette + binding
- Status: applied locally
- Modes: both
- Tokens: `statusSuccessFill` (new). Meaning: opaque positive fill that does not need text contrast. Not `statusSuccess` / `Strong` (ink) and not a component-named `switchGreen`.
- Before → after: dark `#3fa659`, light `#1f7a39` (Figma `1919:102397` / Assistant Settings `1924:106893`, `1913:79570`)
- Binding: `Switch` on-state `contentAccent` / `statusSuccessStrong` → `statusSuccessFill`. Thumb is `contentInverse` in both states. Rest track in light is Figma `#c9cdd4` (not retuning `controlTrack` — segmented chips still use it). Stroke stays 0.5px inset: dark white `.15`, light ink `.25`.
- Geometry: track radius `8px` (`sm` `7px`), thumb radius `6px` (`sm` `5px`). Size still `44×20` / `24` thumb, `2px` pad.
- Neighbors: Enabled / Validated stay `statusSuccess` `#66bb6a` / `#067047`. The fill is brighter and more saturated on purpose.
- Walked: Editor Settings + AI Enable Models switches, light and dark.
- Why: Text greens cannot also be the on-track. Zack wants a reviewable unique green in the same family.
- Out of scope: checkboxes; hover step; retuning `controlTrack`; other controls.
- For Emre: `statusSuccessFill` is the opaque on-fill. Flag if the name should be `controlOn` once more controls share it.

### 2026-09-06 — statusInfo family: Subtle, Text, Control
- Lift: palette
- Status: applied locally
- Modes: both
- Tokens: `statusInfo` (unchanged), `statusInfoSubtle` (new), `statusInfoControl` (new), `statusInfoSurface` (retuned to Subtle wash)
- Before → after:
  - `statusInfo` stays `#81d3f9` / `#176f87` — info type + focus ring at 75%
  - `statusInfoSubtle` dark `#b2e7ff`, light `#159cc1` — latch icon
  - `statusInfoControl` dark `#0c80f3`, light `#0a88db` — checkbox / persistent on-fill (Option 2, bluer)
  - `statusInfoSurface` dark Text `@10%` → Subtle `@5%` `rgba(178, 231, 255, 0.05)`; light Text `@10%` → Subtle `@10%` `rgba(21, 156, 193, 0.10)` (Figma latch well)
- Neighbors: do not retune `statusInfo`. Subtle is the quiet on-glyph, not a banner fill. Control is the opaque fill; porcelain ticks use `contentInverse` (~3.8:1 on Option 2). One wash — Surface is Subtle, not a second Text wash.
- Walked: Figma `1943:113543` / `115332` (latch), `115217` / `117006` (focus), `117179` / `118238` (checkbox)
- Why: Brand crimson was doing chrome jobs (latch, focus, checkbox). Info ramp splits quiet / type / fill so those jobs leave brand.
- Out of scope: `contentAccent` / `actionPrimary`; rail icons; tab underlines; notebook cell focus.
- For Emre: Three roles, one family. Flag if Surface should stay a Text wash for badges — latch Figma is Subtle at 5/10.

### 2026-09-06 — Bind latches, focus, checkboxes, object glyphs to statusInfo
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: values unchanged here
- Binding:
  - Non-rail latched icon buttons (`PrimaryToggleButton` `activeTone="info"`): schema auto-refresh / select, result + notebook freeze. Icon `statusInfoSubtle`, well `statusInfoSurface`. Idle stays `contentSecondary`.
  - Rail `Navigation` (and other rail `PrimaryToggleButton`s) stay `$activeTone="accent"` — `contentAccent` + `interactionAccentActive`. Navigation pins the branded well so a later default change cannot leak.
  - Keyboard focus (`*:focus-visible`, Button, Switch, Checkbox, chrome-tabs, leftover `borderStrong` rings) → `statusInfo` at 75% (`statusInfoFocus`). Notebook cell focus (`CellWrapper`) stays branded.
  - `Checkbox` checked fill `contentAccent` → `statusInfoControl`; tick stays `contentInverse`. Schema multi-select filled circle unchanged.
  - Notebook title glyph + chrome-tab notebook/metrics favicons: `contentObject` → `statusInfo` (light leaves brand `#b81447`).
- Neighbors: `TabButton` underline, AI `$tone="accent"`, `SelectMenu` check, switches (`statusSuccessFill`) unchanged.
- Walked: schema auto-refresh, freeze column, Search “Include closed tabs”, button focus, notebook glyph, rail icons. Light and dark.
- Why: Zack: only non-rail latches take the new pattern. Rail is the branded exception.
- Out of scope: `SelectMenu` check; cell focus; tab underlines; field focus borders (`Input` still `borderStrong` / accent).
- For Emre: `activeTone="info"` is the latch. Do not fold it into `accent`. `contentObject` is now unused in components — collapse when ready.

### 2026-09-06 — Product brand is QDB Pink (same hexes both modes)
- Lift: palette
- Status: applied locally
- Modes: both
- Tokens: `contentAccent`, `contentAccentStrong`, `actionPrimary`, `actionPrimaryHover`, `interactionAccentHover`, `interactionAccentActive`, `borderAccent`, `borderAccentStrong`, `brandGradientStart`, `brandGradientEnd`, `aiGradientStart`, `aiGradientEnd`
- Before → after (both modes unless noted):
  - `contentAccent` `#c94f74` / `#b81447` → `#f0428b` (Pink 300) — rail, tabs, remaining chrome accent
  - `contentAccentStrong` `#cf1750` / `#8a0f35` → `#ee2b7c` (Pink 400)
  - `actionPrimary` `#b81447` / `#8a0f35` → `#bd0f58` (Pink 700)
  - `actionPrimaryHover` `#cf1750` / `#b81447` → `#d41162` (Pink 600)
  - Accent wells rebase on Pink 300; `interactionAccentActive` is **10%** (rail latch well), was 15%/13%
- Neighbors: Pink 700 is the opaque action; Pink 300 is on-chrome. Do not collapse them. Cell focus and `SelectMenu` check inherit Accent.
- Walked: Figma Core `2244:340`; console `1913:61852` / `73608` / `83402` / `93667`
- Why: Pinker brand so it no longer reads as the error red.
- Out of scope: `contentObject`; inventing `qdbPink*` tokens.
- For Emre: Same hexes in light. Flag if light actions need a darker step (old light primary was `#8a0f35`).

### 2026-09-06 — Danger rotates to pure red
- Lift: palette + binding
- Status: applied locally
- Modes: both (hexes shared; light contrast is a known risk)
- Tokens: `statusDanger` `#ff3333`; `statusDangerStrong` `#db2424` (was `#dc2828`); `statusDangerContrast` `#ff4d4d` (new, type on 15% wash); `statusDangerSubtle` `#ff8080` (new, type on 40% wash); `statusDangerSurface` `#db2424` @ **15%**; `statusDangerSurfaceHover` `#db2424` @ **40%**; `statusDangerMuted` Strong @ 72%; `statusDangerBorder` Strong @ 28%
- Binding:
  - `danger` Button is solid Strong + `contentInverse` (Delete conversation confirm, Cancel script). Hover fill is Text `#ff3333`.
  - `dangerGhost` rest Surface + Contrast; hover SurfaceHover + Subtle (Reset Provider, Figma `1948:123286`).
  - Chat history row delete `dangerGhost` → `danger`.
  - Field error border Strong; wash Surface. MCP / login / details banners use Surface, not `statusDanger`+`1f`.
- Neighbors: brand pink and danger red must not share a hex.
- Why: Separate “this is QuestDB” from “this is broken / destructive.”
- Out of scope: light-only darker danger type (Zack said dark first).
- For Emre: Contrast/Subtle are type-on-wash, not fills. Strong is the opaque source.

### 2026-09-06 — Light brand + danger split from dark
- Lift: palette
- Status: applied locally
- Modes: light only (dark hexes unchanged)
- Tokens:
  - `contentAccent` `#bd0f58` — rail icons + tab underlines
  - `contentAccentStrong` `#8e0b42` — sits with actions
  - `actionPrimary` `#8e0b42`; `actionPrimaryHover` `#bd0f58`
  - `interactionAccentActive` `#bd0f58` @ **13%** (rail well); hover rebase @ 8%
  - `statusDanger` `#ce1717` — type + icons always
  - `statusDangerStrong` `#ce1717` — solid Delete fill
  - `statusDangerContrast` `#b81414` — type on `#bd2828` @ 15%
  - `statusDangerSubtle` `#8a0f0f` — type on `#db2424` @ 40% hover
  - `statusDangerSurface` `#bd2828` @ 15%; `statusDangerSurfaceHover` `#db2424` @ 40%
- Neighbors: `danger` / `dangerGhost` variants unchanged — they read these roles. Light solid delete is Text, not the dark Strong `#db2424`.
- Walked: Figma `1913:61813` / `79570` / `85185` / `93656`; hover `1948:123305`
- Why: One-for-one with the dark pass, with a darker action and a contrast-safe light red.
- Out of scope: retuning dark; leaving brand on rail/tabs/cell focus.
- For Emre: Light Strong equals Text so `danger` buttons stay `#ce1717`. Do not share Strong across modes.

### 2026-09-06 — MCP pair error banner
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: no new roles. Light fill is banner-only `rgba(189, 40, 56, 0.08)` (Figma, not the 15% wash). Dark fill is transparent. Stroke is `statusDanger` (light) / `statusDangerMuted` (dark). Type + icon `statusDanger`.
- Binding: `PairPopover` danger `StatusRow` is inset in the form — 1px border, 3px left accent, 6px radius, 12px padding. Validation / WS error / major version-mismatch use it. `StatusDetail` inherits Text, not `contentSecondary`.
- Walked: Figma `1913:86918` (light), `1913:85135` (dark)
- Why: Validation is a status banner, not a full-bleed wash.
- Out of scope: consent modal; connecting / minor-mismatch rows.
- For Emre: Do not fold the 8% banner wash into `statusDangerSurface`.

### 2026-09-06 — Reset Provider is a true ghost, not dangerGhost
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none. `dangerGhost` stays the washed secondary (Surface + Contrast / SurfaceHover + Subtle).
- Binding: Assistant Settings Reset / Remove Provider uses `ghost` + local danger type. Rest is transparent + `statusDanger`. Hover is `#db2424` @ 30% + Subtle in dark; `#bd2828` @ 10% + Text in light. Icons follow type.
- Walked: Figma `1924:106893` / `1948:123175` (dark), `1919:102447` / `1948:123305` (light)
- Why: The filled wash is for secondary destructive chips. Reset is a quiet text action until hover.
- Out of scope: retuning `dangerGhost`; chat-history solid delete.
- For Emre: Do not fold this hover into `statusDangerSurfaceHover` (40%). Reset is the 10%/30% ghost, not the secondary wash.

### 2026-09-06 — Notebook drag slot is a primary wash
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none. `interactionNeutral` @ 25% was the old slot — light `#e8eaee` on stage `#e2e5ea` vanished.
- Binding: `react-grid-placeholder` is `withAlpha(contentPrimary, 0.08)` light / `0.10` dark. Ink on the light stage, porcelain on the dark stage. Opacity lives in the alpha, not a second `opacity`. `interactionHover` is the same idea at 7.5% / 5.5% — too quiet on the stage, and Neutral still matches the light ladder.
- Neighbors: stage `surfaceStage`. Cells `surfaceRaised`. Drag chrome stays `contentAccent`.
- Why: The snap rectangle has to read as a hole on the stage, not a control fill. Neutral is the pressed-chip role.
- Out of scope: the always-on stage dot grid (`interactionHover`); retuning Neutral.
- For Emre: One-off wash. Do not invent `surfaceDragSlot`.

### 2026-09-06 — Freeze latch shares toolbar control height
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none
- Binding: Result freeze (`PrimaryToggleButton`) uses `&&` + `TOOLBAR_CONTROL_HEIGHT` (Button `md` 3.4rem) and the same `0 1.2rem` padding as sibling ghost Buttons. Notebook freeze uses `&&` + ActionButton's 2.8rem / `0 0.6rem`. Latch color stays `statusInfo`.
- Neighbors: `PrimaryToggleButton` itself stays 3.5rem for rail / other chrome. Schema toolbar chips stay 3rem.
- Why: Freeze was a segmented-control latch (3.0–3.5rem, width 4rem) sitting next to default `Button` ghosts. No reason for a different chip.
- Out of scope: retuning `PrimaryToggleButton` globally; latch color.
- For Emre: Geometry only. `&&` is required to beat `SegmentedControlButton` `$size="md"` (3rem) and `PrimaryToggleButton` (3.5rem).

### 2026-09-06 — Result grid header names are Semibold
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none
- Binding: Column header names are Open Sans Semibold (`600`). `ResultGrid` `HeaderName`, notebook shimmer, and the legacy `.qg-header-name` grid. Width sampling uses the same weight so names don't clip.
- Neighbors: header type stays Regular / secondary. Cell values unchanged.
- Why: Figma `1913:84504` — names are `Open Sans SemiBold`, not Regular.
- Out of scope: type-row italic; cell type color.
- For Emre: `HEADER_NAME_FONT_WEIGHT` in `ResultGrid/dimensions.ts`.

### 2026-09-06 — Add Markdown hover is the chrome wash
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none
- Binding: secondary Add Markdown (`AddButton` `$variant="secondary"`) hover `interactionNeutral` → `interactionHover`. Type still `contentPrimary` on hover. Add Cell stays `interactionAccentActive`.
- Neighbors: sits on `surfaceStage`. Light Neutral `#e8eaee` on stage `#e2e5ea` is a lift. Dark Neutral `#32343e` is a pressed chip, several steps up. Ghost / menu / tree / search hover is already `interactionHover` (ink 7.5% / porcelain 5.5%).
- Why: One-step invert against the surface — darker in light, lighter in dark. Neutral is the selected-chip role.
- Out of scope: Add Cell; retuning `interactionHover`; global ghost.
- For Emre: Same wash as other chrome hovers. Do not use Neutral for hover on the stage.

### 2026-09-06 — Result row count is Open Sans Semibold 15
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none
- Binding: Result toolbar count number is `theme.font` / `fontSize.lg` (15px) / `600` / `2.14rem` (21.4px). Dropped `fontMonospace`. "rows" stays Regular `fontSize.sm` (13px) / `1.56rem` / `contentSecondary`.
- Neighbors: header names are Semibold 14. Cell values stay mono.
- Why: Figma `1913:84477` — `350,528` is Open Sans SemiBold 15 / 21.4; `rows` is Regular 13 / 15.6.
- Out of scope: notebook QueryResult "X rows in Yms"; inventing a type token.
- For Emre: Chrome count, not a cell. Keep tabular-nums.

### 2026-09-06 — Light tooltips share the dropdown overlay
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: none
- Binding: `Tooltip` box + arrow fill `surfaceInset` → `surfaceOverlay` in light (`#fafbfc`). Dark stays `surfaceInset` (`#121317`). Stroke stays `borderDefault`.
- Neighbors: dropdowns / popovers already `surfaceOverlay` via `floatingSurfaceStyles`. Light Inset `#f7f8f9` is the editor/grid well, a gray step below Overlay. Dark Inset sits under Overlay on the ladder, so it already matches.
- Why: Light tooltip was a well next to a near-white menu. Same floating layer as the dropdown.
- Out of scope: retuning `surfaceInset`; dark tooltip; adding the menu shadow to tooltips.
- For Emre: Do not fold Inset into Overlay. Inset stays the recessed well.

### 2026-09-06 — Light instance hover card matches tooltips
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: none
- Binding: TopBar `CustomTooltipWrapper` fill `surfaceInset` → `surfaceOverlay` in light. Dark stays `surfaceInset`. Stroke stays `borderDefault`.
- Neighbors: shared `Tooltip` already Overlay in light. Same floating-chrome job as Export / EE tooltips.
- Why: Inset is the well; Overlay is the floating layer. Demo data has no instance type so this card is easy to miss.
- Out of scope: Monaco `editorWidget`; chart settings drawer; instance color-picker well.
- For Emre: Same split as Tooltip. Do not retune Inset.

### 2026-09-06 — Dropdown loom blur 16 → 12 (trial, reverted)
- Lift: binding (geometry, same tokens)
- Status: reverted
- Modes: both — `floatingSurfaceStyles` is shared
- Tokens: none
- Binding: tried third layer blur `1.6rem` → `1.2rem`. Reverted to `0 1.2rem 1.6rem -0.4rem` `shadowMedium`.
- Why: Zack: 12px was a look, not a keep. Light-only quieting is the palette lever (`shadowMedium` 8% vs dark 28%), not shared geometry.
- Out of scope: retuning shadow opacities; dropping the third layer.
- For Emre: Stack unchanged. Trial only.

### 2026-09-06 — Dropdown shadow C, loom split by mode
- Lift: binding (geometry, same tokens)
- Status: applied locally (trial)
- Modes: both; third layer splits
- Tokens: none
- Binding: `floatingSurfaceStyles` (and Monaco / Quick Vis copies):
  - Shared heel: `0 1px 2px 0` `shadowSoft`
  - Shared weight: `0 4px 6px -2px` `shadowMedium`
  - Light loom: `0 8px 8px -4px` `shadowSubtle` (Figma `1957:130606`)
  - Dark loom: `0 12px 16px -4px` `shadowMedium` (kept the old third layer; "126" read as 16)
- Neighbors: SelectMenu / DropdownMenu / Popover / MCP pair / theme + AI model. Modals unchanged.
- Why: Zack: C in both, loom quieter/tighter in light only. Dark still needs the 16px Medium halo.
- Out of scope: retuning shadow opacities; instance hover card; `modalSurfaceStyles`.
- For Emre: Geometry split, not a palette retune. Light loom is Subtle so it does not stack two Mediums.

### 2026-09-06 — Dark ghost danger type is Text, not Subtle
- Lift: binding
- Status: applied locally
- Modes: dark (light kept)
- Tokens: none. `statusDangerSubtle` stays `#ff8080`.
- Binding: `dangerGhost` hover type `statusDangerSubtle` → `statusDanger` (`#ff3333`) in dark. Reset Provider hover type follows. Light hover stays Subtle on the 40% wash.
- Neighbors: rest `dangerGhost` still Contrast `#ff4d4d` + Surface. Solid `danger` unchanged.
- Why: Figma `1948:123286` — Reset Provider type is `#ff3333`, not the 40%-wash Subtle.
- Out of scope: retuning Subtle; light ghost danger; wash opacities.
- For Emre: Subtle remains type-on-40%. Dark ghost hover uses Text.

### 2026-09-06 — In-track maximize hover matches Table/Chart
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: none
- Binding: `ViewIconButton` (maximize / reset-zoom inside `NotebookViewToggle`) light hover `interactionNeutralHover` → `interactionHover`. Same wash as `SegmentedControlButton`. Dark stays `surfaceRaised`.
- Neighbors: track `controlTrack` `#e8eaee`. NeutralHover `#e2e5ea` on that track vanished. Outside-cell Maximize / More stay `surfaceBase` on the raised cell.
- Why: Zack: in-track hover must match Table/Chart, not the ghost icons outside the control.
- Out of scope: CellIconButton; retuning NeutralHover.
- For Emre: In-track hover is the ink wash, not a surface step on the chip track.

### 2026-09-06 — Provider tab hover is one step below selected
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none
- Binding: unselected `ProviderTab` hover `controlSurfaceHover` → `interactionNeutralHover`. Selected stays `interactionNeutral` (including on hover).
- Neighbors: selected Neutral (`#e8eaee` / `#32343e`). NeutralHover is the next step down (`#e2e5ea` / `#292b35`). Dark `controlSurfaceHover` equals Neutral, so hover matched selected.
- Why: Zack: hover should sit one step below the active well, both modes.
- Out of scope: selected fill; tab underline; StatusChip.
- For Emre: Same family as selected. Do not use `controlSurfaceHover` here.

### 2026-09-06 — Light provider-tab hover is one more notch
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: none
- Binding: unselected `ProviderTab` hover in light → `surfaceBase` (`#eef0f3`). Dark stays NeutralHover. Selected stays Neutral. Specificity `&&&&` so TabButton hover cannot win.
- Neighbors: Overlay `#fafbfc` < Base `#eef0f3` < Neutral `#e8eaee`. NeutralHover and the 22% ink wash both sit *below* Neutral (darker). Light hover is a smaller recede than selected, matching dark's "between sidebar and selected" step.
- Why: Zack: 22% had impact but the wrong direction — hover must be lighter than active, not darker.
- Out of scope: retuning NeutralHover; inventing a surface.
- For Emre: Light hover is Base, not an ink wash. Do not fold this into NeutralHover (Table/Chart track).

### 2026-09-06 — Result-grid selection uses info, double hover
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: none. `gridSelection` stays `#252830` / `#d8dce3` (Monaco still reads it).
- Binding: ResultGrid selected row stacks white 11% / ink 15% (exactly 2× `interactionHover`) over `gridRow`. Focused cell stacks `statusInfoSurface` over that fill, ring `statusInfo`. Copy-pulse follows the ring. `gridFocus` unused here. Legacy `.qg-c-active` matches via `html[data-theme]`.
- Neighbors: hover stays 1× `interactionHover` over Inset. Monaco suggest/list hover unchanged. Figma `1943:114709` / `1943:116498`.
- Why: Zack: selection fill is double hover; cell chrome is the info family. Palette retune of `gridSelection` would have moved Monaco — do not.
- Out of scope: retuning `statusInfo` / `statusInfoSurface` / `gridSelection`; `editorSelection`; notebook cell focus.
- For Emre: Grid selection wash is local to ResultGrid, not a token. Cell ring is `statusInfo`, not `gridFocus`.

---

## Parking lot — not logged as decisions yet

Use this for hunches until they become an entry.

- Brand core is QDB Pink, split by mode: dark 300/700 (`#f0428b` / `#bd0f58`), light 700/800 (`#bd0f58` / `#8e0b42`). Still branded: rail, tabs, cell focus, `SelectMenu` check, AI `$tone="accent"`. Danger is the pure-red family (dark bright ramp; light `#ce1717` + contrast steps). `contentObject` unused. Treat leftovers as **binding**.
- `interactionNeutral` / `controlTrack` leftover `#d9dce2` — addressed 2026-09-01 (table/chart chips).
- New surface roles: only if two neighbors with *different jobs* are forced to share a token. Propose the meaning first (`surfaceSomething`), then values in both themes.
