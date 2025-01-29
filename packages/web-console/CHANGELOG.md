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
