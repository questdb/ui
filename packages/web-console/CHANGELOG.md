# Changelog

All notable changes to `@questdb/web-console` project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Types of changes

* `Added` for new features.
* `Changed` for changes in existing functionality.
* `Deprecated` for soon-to-be removed features.
* `Removed` for now removed features.
* `Fixed` for any bug fixes.
* `Security` in case of vulnerabilities.

## Next

### Added

- Improve visual cues in the query editor. Highlighting active query with green bar, erroneous query with red dot and add run button. [#34](https://github.com/questdb/ui/pull/34)

### Fixed

- fix duplication issue when loading web console with `?query=some sql&executeQuery=true` multiple time [#33](https://github.com/questdb/ui/pull/33)

## 0.0.6 - 2022-09-26

### Added

- Added a check for Github API response
  [28eb409](https://github.com/questdb/ui/commit/28eb409e5b79e0a9e6b675f6f9f01f7a7465cbe0)

### Fixed

- Fixed context menu in Table schema not working in Safari
  [0aed379](https://github.com/questdb/ui/commit/0aed379873e5cd6b05743aac4a2fcda1d9a1bf2a)

## 0.0.5 - 2022-09-23

### Added

- Add popup to show keyboard shortcuts [a3a10c9b](https://github.com/questdb/ui/commit/a3a10c9b8678de761a1e9ce1ab380837d9121e2a)

## 0.0.4 - 2022-09-06

### Added

- Add info about an available update to QuestDB

## 0.0.3 - 2022-08-23

### Changed

- update CSV import UI with info box about `COPY` command [38584a0a](https://github.com/questdb/ui/commit/038584a0a8e86641628be19f402a540488bb70468)

## 0.0.2 - 2022-06-23

### Changed

- add `LIMIT -10000` to telemetry query [bf1fbdb5](https://github.com/questdb/ui/commit/bf1fbdb5ef91a8111330fc8b8cea4a889ebcbca0)

### Fixed

- fix `select build()` being called repeatedly [#2217](https://github.com/questdb/questdb/pull/2217)

## 0.0.1 - 2022-06-10

### Changed

- Code of `web-console` was extracted from [questdb core repo](https://github.com/questdb/questdb) and released for the first time on `npm` as [`@questdb/web-console`](https://www.npmjs.com/package/@questdb/web-console). No other changes were made.
