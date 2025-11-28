# Changelog

All notable changes to `@questdb/web-console` project will be documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Types of changes

- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.


## 1.1.6 - 2025.11.28
### Changed
- apply new login screen design [#501](https://github.com/questdb/ui/pull/501)
### Fixed
- serve build assets relative to the base path [#502](https://github.com/questdb/ui/pull/502)


## 1.1.5 - 2025.11.25
### Fixed
- save resized column width before arranging array contents [#497](https://github.com/questdb/ui/pull/497)
### Added
- enable dynamic Y-axis scaling in chart view [#493](https://github.com/questdb/ui/pull/493)


## 1.1.4 - 2025.10.24
### Added 
- export parquet files [#484](https://github.com/questdb/ui/pull/484)

### Fixed
- unresponsive CSV imports [#484](https://github.com/questdb/ui/pull/484)
- do not start a quote in comments [#483](https://github.com/questdb/ui/pull/483)


## 1.1.3 - 2025.10.03
### Added
- add column name search to Schema filter [#478](https://github.com/questdb/ui/pull/478)
- add loading indicator and notification for a single query when running multiple queries [#456](https://github.com/questdb/ui/pull/456)

### Fixed
- handle timestamp_ns format in CSV imports [#474](https://github.com/questdb/ui/pull/474)
- update sql grammar, fix highlighting of array operations and sampling rate [#472](https://github.com/questdb/ui/pull/472)
- fix for users with space in their name are unable to import CSV file [#473](https://github.com/questdb/ui/pull/473)


## 1.1.2 - 2025.08.29
### Fixed
- infinite state updates in metrics [#469](https://github.com/questdb/ui/pull/469)


## 1.1.1 - 2025.08.28
### Fixed
- remove indexed db backwards/forwards compatibility issue [#467](https://github.com/questdb/ui/pull/467)
- use quotes in table name when resuming WAL [#466](https://github.com/questdb/ui/pull/466)


## 1.1.0 - 2025.08.18
### Added
- search across multiple tabs [#459](https://github.com/questdb/ui/pull/459)


## 1.0.2 - 2025.08.15
### Fixed
- add pulse to example queries button if not visited [#457](https://github.com/questdb/ui/pull/457)
- perform uniqueness check on column names trimmed and case-insensitive [#454](https://github.com/questdb/ui/pull/454)


## 1.0.1 - 2025.07.10
### Fixed
- declare variable highlighting in editor & query parameter parsing in chart request [#452](https://github.com/questdb/ui/pull/452)


## 1.0.0 - 2025.07.04
### Added
- dynamic query status indicators, run button per query, run all queries in tab [#437](https://github.com/questdb/ui/pull/437)
- show table icon description in the tooltip [#443](https://github.com/questdb/ui/pull/443)

### Fixed
- array truncation in grid & bug fixes [#448](https://github.com/questdb/ui/pull/448)
- use correct query for resuming WAL for a materialized view [#445](https://github.com/questdb/ui/pull/445)
- fix for users with a . in their name are unable to edit instance name (enterprise) [#446](https://github.com/questdb/ui/pull/446)
- do not persist OAuth2 tokens [#438](https://github.com/questdb/ui/pull/438)
- do not refresh settings on focus when auto-refresh is disabled [#442](https://github.com/questdb/ui/pull/442)
- flakiness and case updates [#441](https://github.com/questdb/ui/pull/441)


## 0.7.13 - 2025.05.30
### Changed
- hide edit from instance badge for readonly settings [#439](https://github.com/questdb/ui/pull/439)


## 0.7.12 - 2025.05.29
### Fixed
- inline the logo in offline view [#435](https://github.com/questdb/ui/pull/435)
- make tab renaming more visible [#434](https://github.com/questdb/ui/pull/434)
- change the prod icon && tweaks on the tooltip [#433](https://github.com/questdb/ui/pull/433)
- wrong updates due to grid virtualization issues [#432](https://github.com/questdb/ui/pull/432)
- correct error highlighting if the error position at the end [#431](https://github.com/questdb/ui/pull/431)


## 0.7.11 - 2025.05.23
### Added
- instance naming UI [#427](https://github.com/questdb/ui/pull/427)
- make SSO re-authentication optional on logout [#412](https://github.com/questdb/ui/pull/412)

### Fixed
- wait for all body to be streamed before calculating network time [#429](https://github.com/questdb/ui/pull/429)
- jit compiled icon shrink problem and notifications height [#428](https://github.com/questdb/ui/pull/428)


## 0.7.10 - 2025.04.28
### Added
- owner setting for tables created during CSV import [#413](https://github.com/questdb/ui/pull/413)
- keyboard navigation for table listing [#420](https://github.com/questdb/ui/pull/420)

### Fixed
- correct wording for copy sql command link [#422](https://github.com/questdb/ui/pull/422)
- update query extracting logic from cursor [#421](https://github.com/questdb/ui/pull/421)
- fix grid unresponsiveness after scroll [#425](https://github.com/questdb/ui/pull/425)


## 0.7.9 - 2025.04.16
### Added
- array type support [#391](https://github.com/questdb/ui/pull/391)

### Fixed
- minor improvements to tests and performance [#406](https://github.com/questdb/ui/pull/406)
- show JSON parsing error in case of an invalid query result [#411](https://github.com/questdb/ui/pull/411)
- open a new tab when query param exists and metrics tab is open [#415](https://github.com/questdb/ui/pull/415)
- fix incorrect unit normalisation for wal row throughput [#414](https://github.com/questdb/ui/pull/414)
- don't use navigator.clipboard in insecure context [#417](https://github.com/questdb/ui/pull/417)
- workaround for broken safari copy schema mechanism [#418](https://github.com/questdb/ui/pull/418)


## 0.7.8 - 2025.03.28
### Added

- add storage details, persistent expand states, symbol details [#409](https://github.com/questdb/ui/pull/409)

### Fixed

- flakiness improvements for CI [#407](https://github.com/questdb/ui/pull/407)

## 0.7.7 - 2025.03.20
### Added

- Add materialized views support [#405](https://github.com/questdb/ui/pull/405)

### Fixed

- fixing a Path Traversal Vulnerability [#321](https://github.com/questdb/ui/pull/321)

## 0.7.6 - 2025.02.27

### Added

- Add button to copy query plans and result sets to clipboard in markdown format [#393](https://github.com/questdb/ui/pull/393)

### Fixed

- Escape table name for SHOW CREATE TABLE [#398](https://github.com/questdb/ui/pull/398)

## 0.7.5 - 2025.02.13

### Fixed

- Fix floating-point regex capturing words beginning with 'E' [#394](https://github.com/questdb/ui/pull/394)
- Prevent login loop when token expires without a valid refresh token [#395](https://github.com/questdb/ui/pull/395)

## 0.7.4 - 2025.02.05

### Added

- support for OAuth2 state parameter [#390](https://github.com/questdb/ui/pull/390)

## 0.7.3 - 2025.01.29

### Fixed

- another patch for 0.7.0 (charts)

## 0.7.2 - 2025.01.28

### Fixed

- another patch for 0.7.0 (charts)

## 0.7.1 - 2025.01.27

### Fixed

- fixed issues introduced by [#352](https://github.com/questdb/ui/pull/352) - https://github.com/questdb/ui/pull/378

## 0.7.0 - 2025.01.21

### Added

- WAL Metrics for tables [#352](https://github.com/questdb/ui/pull/352)
- Add TTL feature to tables [#365](https://github.com/questdb/ui/pull/365)
- webpack dev server proxy to take context path from env variable
  [#371](https://github.com/questdb/ui/pull/371)

### Changed

- use `SHOW CREATE TABLE` in `Copy schema to clipboard`
  [#369](https://github.com/questdb/ui/pull/369)
- Make autocomplete case insensitive
  [#366](https://github.com/questdb/ui/pull/366)

### Fixed

- kick user out if access token expired and there is no refresh token
  [#373](https://github.com/questdb/ui/pull/373)

## 0.6.5 - 2024.12.02

### Changed

- use a new information_schema.questdb_columns() instead of
  information_schema.columns() [#359](https://github.com/questdb/ui/pull/359)

## 0.6.4 - 2024.11.25

### Added

- Support for ID token in Auth [#355](https://github.com/questdb/ui/pull/355)
- News Image zoom [#350](https://github.com/questdb/ui/pull/350)

### Changed

- Highlight integer numbers that include `_` (underscore) separator
  [#353](https://github.com/questdb/ui/pull/353)
- Handle and display error received while scrolling the grid
  [#348](https://github.com/questdb/ui/pull/348)

## 0.6.3 - 2024.10.23

### Added

- Improvements for Tables UI section
  [#340](https://github.com/questdb/ui/pull/340)

### Changed

- Change upload COPY info [#347](https://github.com/questdb/ui/pull/347)

## 0.6.2 - 2024.10.15

### Fixed

- UX improvements around editor [#338](https://github.com/questdb/ui/pull/338)
- Running query is not cancelled when Run button is clicked

### Changed

- Support for notice responses from server, such as empty SQL notice
  [#334](https://github.com/questdb/ui/pull/334)

## 0.6.1 - 2024.10.07

### Fixed

- Handle line comments in SQLs [#333](https://github.com/questdb/ui/pull/333)
- Handle comments in SQL editor highlights
  [#335](https://github.com/questdb/ui/pull/336)
- Tab state update issues that lead to visual side effects
  [#337](https://github.com/questdb/ui/pull/337)

### Changed

- Tab History UI updates [#335](https://github.com/questdb/ui/pull/335)

## 0.6.0 - 2024.09.26

### Added

- Tabs in SQL Editor [#329](https://github.com/questdb/ui/pull/329)

### Fixed

- Display Copy action for suspended tables
  [#332](https://github.com/questdb/ui/pull/332)
- Fix the response to handle all case table names
  [#328](https://github.com/questdb/ui/pull/328)

## 0.5.2 - 2024.09.05

### Added

- Configurable Redirect URI and scope for OIDC integration
  [#323](https://github.com/questdb/ui/pull/323)

### Changed

- Run Console tests with Auth [#310](https://github.com/questdb/ui/pull/310)

### Fixed

- Fix suspension lag count [#327](https://github.com/questdb/ui/pull/327)

## 0.5.1 - 2024.07.24

### Added

- Community forum in Help menu [#312](https://github.com/questdb/ui/pull/312)

### Fixed

- Charts not working when using Auth
  [#310](https://github.com/questdb/ui/pull/310)

## 0.5.0 - 2024.07.16

### Added

- Add Telemetry tests [#298](https://github.com/questdb/ui/pull/298)
- Add WAL suspension info and resolution logic, add OS configuration warnings
  and resolution info [#291](https://github.com/questdb/ui/pull/291)

### Changed

- Improve integration testing [#305](https://github.com/questdb/ui/pull/305)

## 0.4.5 - 2024.06.25

### Added

- show login dialog for QuestDB OSS when authentication is enabled
  [#300](https://github.com/questdb/ui/pull/300)

### Fixed

- fix OAuth2 redirect URI [#303](https://github.com/questdb/ui/pull/303)

## 0.4.4 - 2024.06.19

### Added

- Start EE telemetry [#294](https://github.com/questdb/ui/pull/294)
- Use relative URLs [#299](https://github.com/questdb/ui/pull/299)

### Fixed

- Include link to timestamp formats docs in CSV import schema editor
  [#295](https://github.com/questdb/ui/pull/295)
- Copy grid cell content to clipboard on MacOS
  [#297](https://github.com/questdb/ui/pull/297)

## 0.4.3 - 2024.05.30

### Fixed

- Start OSS telemetry [#292](https://github.com/questdb/ui/pull/292)

## 0.4.2 - 2024.05.16

### Added

- Add bundle size watcher task [#288](https://github.com/questdb/ui/pull/288)
- Add PostHog support [#284](https://github.com/questdb/ui/pull/284)
- Support varchar column type [#281](https://github.com/questdb/ui/pull/281)

### Fixed

- Handling DML response for INSERT and UPDATE
  [#290](https://github.com/questdb/ui/pull/290)

## 0.4.1 - 2024.05.08

### Fixed

- Align displayed timings with real fetch time
  [#282](https://github.com/questdb/ui/pull/282)

## 0.4.0 - 2024.04.29

### Added

- Added logic around authorization
  [#272](https://github.com/questdb/ui/pull/272)

### Changed

- Align varchar columns left, yarn4 migration
  [#269](https://github.com/questdb/ui/pull/269)

### Fixed

- Do not trigger autocomplete on newlines
  [#267](https://github.com/questdb/ui/pull/267)
- Get rid of autocomplete duplicates
  [#268](https://github.com/questdb/ui/pull/268)
- File settings not being passed on to CSV upload
  [#271](https://github.com/questdb/ui/pull/271)
- Capture exception if CSV Copy availability check fails
  [#273](https://github.com/questdb/ui/pull/273)
- Show an icon next to non-designated timestamp columns
  [#279](https://github.com/questdb/ui/pull/279)

## 0.3.3 - 2024.01.05

### Added

- Enhanced SQL editor autocomplete
  [#241](https://github.com/questdb/ui/pull/241)
- Commit hash info [#249](https://github.com/questdb/ui/pull/249)

### Changed

- CSV Import disclaimer texts [#229](https://github.com/questdb/ui/pull/229)
- Replace jQuery event bus with eventemitter3
  [#250](https://github.com/questdb/ui/pull/250)
- New Import icon [#258](https://github.com/questdb/ui/pull/258)

### Fixed

- Fix issues with Run button in editor gutter
  [#257](https://github.com/questdb/ui/pull/257)
- Fix results and editor panel size configs
  [#260](https://github.com/questdb/ui/pull/260)

## 0.3.2 - 2023.11.16

### Added

- Add `DEDUP` support in `Copy schema to clipboard`
  [#235](https://github.com/questdb/ui/pull/235)

### Fixed

- Fix table schema form on already existing tables
  [#236](https://github.com/questdb/ui/pull/236)
- Fix query execution when line comments are present
  [#231](https://github.com/questdb/ui/pull/231)

## 0.3.1 - 2023.11.15

### Added

- Add current_user info in the top bar
  [#225](https://github.com/questdb/ui/pull/225)
- Update pane splitters to real time
  [#220](https://github.com/questdb/ui/pull/220)
- Add 'return to Cloud' button [#232](https://github.com/questdb/ui/pull/232)

### Changed

- Update SQL Grammar to v1.0.14 [#233](https://github.com/questdb/ui/pull/233)

## 0.3.0 - 2023.11.08

### Changed

- allow ampersand in the grid output
  [#222](https://github.com/questdb/ui/pull/222)

### Fixed

- Disable create table/import UI in read-only mode
  [#221](https://github.com/questdb/ui/pull/221)

## 0.2.9 - 2023.11.07

### Added

- General UI refresh, new News UI, new CSV Import UI
  [#199](https://github.com/questdb/ui/pull/199)

### Changed

- Enable HMR for CSS and improve overflow behaviour of bottom panel
  [#214](https://github.com/questdb/ui/pull/214)
- Rename Table.name to Table.table_name
  [#212](https://github.com/questdb/ui/pull/212)

### Fixed

- Escape HTML characters in the grid
  [#218](https://github.com/questdb/ui/pull/218)
- Fix showTables for Backwards Compatibility with name Property in QuestDB
  [#213](https://github.com/questdb/ui/pull/213)

## 0.2.8 - 2023.10.16

### Changed

- Update Webpack config, add hot module reloading, enable webpack tree-shaking,
  reduce build size [#205](https://github.com/questdb/ui/pull/205)

### Fixed

- table list disappears after erroneous SQL execution
  [#204](https://github.com/questdb/ui/pull/204)
- render crash when grid is empty [#198](https://github.com/questdb/ui/pull/198)

## 0.2.7 - 2023.09.08

### Changed

- Added the missing data types: ipv4, byte, binary, long256, uuid.
  [#191](https://github.com/questdb/ui/pull/191)
- Allow writing multiple files to the same target table
  [#192](https://github.com/questdb/ui/pull/192)
- Updated build instructions [#195](https://github.com/questdb/ui/pull/195)

### Fixed

- Incorrect timestamp check icon when selected
  [#191](https://github.com/questdb/ui/pull/191)
- Multiple designated timestamps could be selected
  [#191](https://github.com/questdb/ui/pull/191)
- An unnecessary second scrollbar appeared in the UI
  [#191](https://github.com/questdb/ui/pull/191)

## 0.2.6 - 2023.08.15

### Changed

- Updated language grammar in SQL Editor
  [#187](https://github.com/questdb/ui/pull/187)
- Deprecated `durable` upload setting
  [#183](https://github.com/questdb/ui/pull/183)

## 0.2.5 - 2023-08-01

### Fixed

- Incorrect rendering of the last few columns in the grid
  [#170](https://github.com/questdb/ui/pull/170)

### Changed

- Only check for new QuestDB releses in Open Source version
  [#171](https://github.com/questdb/ui/pull/171)
- Remove Handlebars [#175](https://github.com/questdb/ui/pull/175)

## 0.2.4 - 2023-06-29

### Fixed

- Prevent UI from when unexpected `select build` value is parsed for
  `BuildVersion` button [#168](https://github.com/questdb/ui/pull/165)

## 0.2.3 - 2023-06-23

### Changed

- Display different button variation at the bottom right depending on the
  database version [#165](https://github.com/questdb/ui/pull/165)

## 0.2.2 - 2023-06-09

### Added

- Refresh file status when Import page is back in view
  [#151](https://github.com/questdb/ui/pull/151)
- Support adding duplicate filenames in Import
  [#155](https://github.com/questdb/ui/pull/155)

### Fixed

- Execute a correct SELECT query after a successful import
  [#157](https://github.com/questdb/ui/pull/157)
- Fix long file name overlap in Import queue
  [#150](https://github.com/questdb/ui/pull/150)
- Fixed an issue when the user could not paste text into form inputs, causing
  the drawer to close [#154](https://github.com/questdb/ui/pull/154)
- Pasting a file to an existing import queue removed all previous entries
  [#154](https://github.com/questdb/ui/pull/154)

# Changed

- Added a sample timestamp format text that stays below the pattern input all
  the time in Import [#154](https://github.com/questdb/ui/pull/154)

## 0.2.1 - 2023-05-18

### Added

- Allow editing schema on existing tables (column type, designated timestamp and
  its pattern, geohash precision) [#140](https://github.com/questdb/ui/pull/140)
- Adjust pasting CSV files from clipboard to not require page wrapper focus
  [#147](https://github.com/questdb/ui/pull/147)

### Changed

- Simplify and refactor state management in schema editor
  [#139](https://github.com/questdb/ui/pull/139)

## 0.0.11 - 2023-02-13

### Fixed

- tidy-up grid visuals
- fix grid column resize glitches
- improve grid render performance by over 80%
- fix horizontal splitter resize issue

### Added

- grid semantic highlighting for designated timestamp values
- grid semantic highlighting for null values

## 0.0.11 - 2023-02-07

- made column type a subtext in column header
- column header is a little taller
- new header look and feel
- new "drag handles"
- designated timestamp columns is highlighted in green
- column resize fixed as in when columns get narrower and by that do not fill
  entire viewport - the virtual cells are re-rendered and subsequent glitches
  fixed
- column width is rendered based on first 1000 rows of data
- column name is using ellipsis when it does not fit in column
- column resize uses ghost bar to improve resize performance on complicated
  grids

## 0.0.10 - 2023-02-03

- grid is virtualized horizontally, fixed bunch of glitches, added column
  resize, added cell copy to clipboard shortcuts, updated visuals

## 0.0.9 - 2023-02-02

### Added

- add icon next to WAL enabled tables
  [#73](https://github.com/questdb/ui/pull/73)
- highlight `EXPLAIN` keyword in web console
  [#74](https://github.com/questdb/ui/pull/73)

## 0.0.8 - 2022-10-19

### Fixed

- Fix broken query marker in editor gutter on Windows
  [#67](https://github.com/questdb/ui/pull/67)
- Fix position of highlighted row in results grid, when moving it with keyboard
  arrow down button [#66](https://github.com/questdb/ui/pull/66)

## 0.0.7 - 2022-09-28

### Added

- Improve visual cues in the query editor. Highlighting active query with green
  bar, erroneous query with red dot and add run button.
  [#34](https://github.com/questdb/ui/pull/34)

### Fixed

- fix duplication issue when loading web console with
  `?query=some sql&executeQuery=true` multiple time
  [#33](https://github.com/questdb/ui/pull/33)

## 0.0.6 - 2022-09-26

### Added

- Added a check for Github API response
  [28eb409](https://github.com/questdb/ui/commit/28eb409e5b79e0a9e6b675f6f9f01f7a7465cbe0)

### Fixed

- Fixed context menu in Table schema not working in Safari
  [0aed379](https://github.com/questdb/ui/commit/0aed379873e5cd6b05743aac4a2fcda1d9a1bf2a)

## 0.0.5 - 2022-09-23

### Added

- Add popup to show keyboard shortcuts
  [a3a10c9b](https://github.com/questdb/ui/commit/a3a10c9b8678de761a1e9ce1ab380837d9121e2a)

## 0.0.4 - 2022-09-06

### Added

- Add info about an available update to QuestDB

## 0.0.3 - 2022-08-23

### Changed

- update CSV import UI with info box about `COPY` command
  [38584a0a](https://github.com/questdb/ui/commit/038584a0a8e86641628be19f402a540488bb70468)

## 0.0.2 - 2022-06-23

### Changed

- add `LIMIT -10000` to telemetry query
  [bf1fbdb5](https://github.com/questdb/ui/commit/bf1fbdb5ef91a8111330fc8b8cea4a889ebcbca0)

### Fixed

- fix `select build()` being called repeatedly
  [#2217](https://github.com/questdb/questdb/pull/2217)

## 0.0.1 - 2022-06-10

### Changed

- Code of `web-console` was extracted from
  [questdb core repo](https://github.com/questdb/questdb) and released for the
  first time on `npm` as
  [`@questdb/web-console`](https://www.npmjs.com/package/@questdb/web-console).
  No other changes were made.
