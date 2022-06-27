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

## 0.0.2 - 2022-06-23

### Changed

- add `LIMIT -10000` to telemetry query [bf1fbdb5](https://github.com/questdb/ui/commit/bf1fbdb5ef91a8111330fc8b8cea4a889ebcbca0)

### Fixed

- fix `select build()` being called repeatedly [#2217](https://github.com/questdb/questdb/pull/2217)

## 0.0.1 - 2022-06-10

### Changed

- Code of `web-console` was extracted from [questdb core repo](https://github.com/questdb/questdb) and released for the first time on `npm` as [`@questdb/web-console`](https://www.npmjs.com/package/@questdb/web-console). No other changes were made.
