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

## 0.3.3 - 2023.11.16

### Added
- Enhanced SQL editor autocomplete [#241](https://github.com/questdb/ui/pull/241)
- Commit hash info [#249](https://github.com/questdb/ui/pull/249)

### Changed
- CSV Import disclaimer texts [#229](https://github.com/questdb/ui/pull/229)
- Replace jQuery event bus with eventemitter3 [#250](https://github.com/questdb/ui/pull/250)
- New Import icon [#258](https://github.com/questdb/ui/pull/258)

### Fixed
- Fix issues with Run button in editor gutter [#257](https://github.com/questdb/ui/pull/257)
- Fix results and editor panel size configs [#260](https://github.com/questdb/ui/pull/260)

## 0.3.2 - 2023.11.16

### Added
- Add `DEDUP` support in `Copy schema to clipboard` [#235](https://github.com/questdb/ui/pull/235)

### Fixed
- Fix table schema form on already existing tables [#236](https://github.com/questdb/ui/pull/236)
- Fix query execution when line comments are present [#231](https://github.com/questdb/ui/pull/231)

## 0.3.1 - 2023.11.15

### Added

- Add current_user info in the top bar [#225](https://github.com/questdb/ui/pull/225)
- Update pane splitters to real time [#220](https://github.com/questdb/ui/pull/220)
- Add 'return to Cloud' button [#232](https://github.com/questdb/ui/pull/232)

### Changed
- Update SQL Grammar to v1.0.14 [#233](https://github.com/questdb/ui/pull/233)

## 0.3.0 - 2023.11.08

### Changed
- allow ampersand in the grid output [#222](https://github.com/questdb/ui/pull/222)

### Fixed
- Disable create table/import UI in read-only mode [#221](https://github.com/questdb/ui/pull/221)

## 0.2.9 - 2023.11.07

### Added
- General UI refresh, new News UI, new CSV Import UI [#199](https://github.com/questdb/ui/pull/199)

### Changed
- Enable HMR for CSS and improve overflow behaviour of bottom panel [#214](https://github.com/questdb/ui/pull/214)
- Rename Table.name to Table.table_name [#212](https://github.com/questdb/ui/pull/212)

### Fixed
- Escape HTML characters in the grid [#218](https://github.com/questdb/ui/pull/218)
- Fix showTables for Backwards Compatibility with name Property in QuestDB [#213](https://github.com/questdb/ui/pull/213)

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
