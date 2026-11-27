---
name: web-console-tests
description: Write and run tests for a QuestDB Web Console change so that its behavior is covered at the right layer (unit, React Testing Library, integration, Cypress) and meaningful changed behavior has regression tests. Use when adding or fixing code that needs tests, when a review reports a coverage gap, or when asked which kind of test to write.
---

# Web Console tests

The goal: every behavior the change adds or alters against BASE is covered by a test that
fails when that behavior breaks, at the cheapest layer that can observe it,
so a regression fails a test.

Write the tests while you write the change. Use the dimensions below to
choose meaningful cases for the behavior the change adds or alters.

## Layers: which test for what

### Unit (`src/**/*.test.ts`, beside the source)

Helpers, utils and every piece of complex logic live in plain functions, and
unit tests cover them: parsing, formatting, query building, selection and
validation rules, reducers, selectors, permission checks, migrations,
compression round trips. When logic sits inside a component or a hook,
extract it into a function first, then test the function. Most branches of a
change should be covered here: it is the fastest layer and the one coverage
sees best.

### Component (`src/**/*.test.tsx`, React Testing Library + jsdom)

How a component behaves in its different states: loading, empty, error,
done; controlled values; what a click, a key or a prop change does; what it
renders and announces (role, accessible name); cleanup on unmount; a late
response after a re-render. This is the layer between unit and end-to-end:
the component's own behavior, with its collaborators real where they are
cheap and stubbed at the network boundary.

- Start the file with `// @vitest-environment jsdom`.
- Use the helpers in `src/test`: `renderComponent`, `findHook`,
  `requestUrl`, `stubBrowserGlobals`.
- Query by role and accessible name, not by class or test id, unless no role
  fits.
- jsdom has no layout and its focus handling differs from a browser:
  geometry, scrolling, virtualization windows and Monaco need Cypress.

### Integration (`test/integration/<feature>/*.test.ts(x)`)

A flow that crosses several modules, without a browser: the real
providers, store, controllers and persistence, with only the network client,
timers and browser APIs stubbed. Use it when a component test would have to
mock the very collaborators the behavior depends on. Fits here:

- agent tools end to end through the real dispatcher (`dispatch.ts`,
  `dispatchMCPTool.ts`), once per permission level the change concerns;
- AI chat flows with a stubbed provider transport (`test/integration/ai`);
- sign-in, session refresh and cleanup (`test/integration/auth`);
- catalog and Query Activity sources with fake timers
  (`test/integration/catalog`);
- the notebook controller, background edits and persistence across a reload,
  with Dexie on `fake-indexeddb` (`test/integration/notebook`);
- the MCP bridge's permission and freshness rules (`test/integration/mcp`).

Reuse the feature's harness in `test/integration/<feature>/support` and
`src/test/stubBrowserGlobals`; add to a harness rather than copying setup.
Keep each file fast: fake timers, no sleeps, small data.

### End-to-end (`test/e2e/console/*.spec.js`, Cypress)

Only the main user flows and scenarios: a user opens the feature, uses it the
way most users will, and sees the result; and its main error path. Not small
flags, options or variations of behavior: those belong to component and unit
tests.

- A regular new feature gets one or two cases: its happy path and, when it has one,
  its main error path, as a long user flow.
- Seed state directly (`localStorage`, IndexedDB `web-console`, fixtures in
  `test/e2e/fixtures`, commands in `test/e2e/commands.js`); never build it
  through the UI.
- **Run every new or changed case and time it.** Each case should take at most
  10 seconds; one that takes longer is cut down (seed instead of click, fewer
  steps) or says why it must not be. The CI's end-to-end time must barely
  move. Run one spec at a time from the current checkout. A separate
  worktree and a production build are not required.

  1. **Check port 9000 first.** Make a read-only request to QuestDB at
     `http://127.0.0.1:9000/exec` (query `SELECT 1`). If it responds and is a
     disposable test instance, reuse it; do not rebuild, restart or stop it.
     Do not run specs that modify tables or settings against a server with
     data or settings you need to keep.
  2. **Use the console from this checkout.** Reuse an existing dev server if
     it serves this checkout and proxies to that test instance. Otherwise
     start Vite from this checkout with
     `node scripts/with-slots.mjs 3 -- yarn vite --host 127.0.0.1 --port <free-port> --strictPort`
     and verify its proxy points at the test instance. If no suitable
     QuestDB is running, use the jar from `test/e2e/questdb`; build the
     submodule only if its jar is missing. The isolated fallback is to build
     this checkout and run `node scripts/review-browser-env.mjs start --app . --dir <fresh-state-dir>`.
     It starts QuestDB and preview on free ports. When done, run
     `node scripts/review-browser-env.mjs stop --dir <same-state-dir>`.
     Never stop a server you reused.
  3. Set `CONSOLE_URL` to the checkout's dev URL or the script's `PREVIEW_URL`,
     then run Cypress:

     ```bash
     node scripts/with-slots.mjs 2 -- env -u ELECTRON_RUN_AS_NODE \
       yarn cypress run --spec test/e2e/console/<file>.spec.js --config baseUrl="$CONSOLE_URL"
     ```

     The run prints each case's time; report them.

## Dimensions

review-pr's Step 2.6 uses this list too.

- **Happy path.**
- **Error:** a failed request, a server error, a rejected tool call.
- **Empty and NULL:** empty results, empty strings, missing fields, NULL.
- **Boundary:** row caps; 0, 1 and many; the largest values (LONG beyond
  2^53, DECIMAL scale, timestamp precision).
- **Async:** unmount mid-flight, rapid repeat, abort and restart, a stale
  response.
- **Cleanup:** timers, listeners, subscriptions, AbortControllers, Monaco
  disposables.
- **Persisted state from an earlier version:** what an older build wrote to
  IndexedDB or localStorage, and an export an older build made.
- **Both themes,** when styling changes.
- **Keyboard and focus,** when interaction changes.
- **Agent permission levels** (schema, read, write), when agent-facing output
  changes.

## Coverage

When checking for gaps, run Vitest with its built-in coverage once and look
at the reported uncovered files and lines. Check them against the Git diff
and add tests for meaningful changed behavior that lacks a useful assertion.
No custom report, percentage target, or explanation for each uncovered line.
Run the tests you add or change; do not rerun the full suite just for coverage.
Cypress is not included in the Vitest report.

## Expected results

Expected results come from an independent source: the specification, the
user's decisions, the QuestDB documentation, the server's actual response to
the query, plain arithmetic in the test. Never paste the output of the code
under test into the expectation.

## Every test can fail

Write each test before the code it covers and see it fail. Assert the exact
result - the rendered value, the rows, the SQL sent, the message, the
persisted state - never only that something ran or did not throw. A test
added to reach an uncovered line asserts what that line does, so that
breaking the line fails the test.

## Class fixes

A fix of a class of bug - every visual, every tool, every persisted field -
comes with a table-driven or model-based test that iterates the registry or
catalog, so that a new case without coverage fails. Write it against the old
code first: the failing cases are marked `it.fails`, and the fix flips them
to `it`.

## Style

`// Given`, `// When`, `// Then` in every test; a name that states the
intent; no tests of trivial behavior. Reuse the existing helpers and
fixtures, and prefer `it.each` to copies of one test. Mock only at the
boundary (network, timers, browser APIs), never the internal collaborator
whose behavior the test claims.

## CI time

No wall-clock assertions. Fake timers instead of sleeps. No DOM rendering
where a pure function shows the behavior. State the runtime of each new test
file; a Vitest file that takes more than a few seconds, or a Cypress case
over 10 seconds, needs a reason.

## Running tests

Every heavy command, tests included, runs inside one machine-wide memory
budget of 9 units (about 1 GB each), shared with every review, repo and
worktree on the machine: `node scripts/with-slots.mjs <weight> -- <command>`.

| Job | Weight |
|---|---|
| `yarn install`, `yarn add` | 2 |
| Vitest on explicit test files, `--maxWorkers=1 --minWorkers=1` | 1 |
| `vitest related` (avoid: a shared util pulls in most of the suite) | 2 |
| Full suite, with or without coverage, `--max-workers 4` | 3 |
| `yarn typecheck` | 3 |
| `yarn build` (includes the checker's tsc) | 4 |
| `yarn lint` | 4 |
| `vite preview` of a built `dist` | 0 |
| Cypress spec | 2 |
| QuestDB server for Cypress | 2 |
| Headed Chrome probe | 3 |
| Vite dev server (loads the type checker) | 3 |

The wrapper adds 1 to a Vite or Vitest job while `vite.config.mts` starts
`vite-plugin-checker` without a `process.env.VITEST` guard; pass the table's
weight. Run named test files, not the whole suite (a review runs it once per
round): `TZ=UTC yarn vitest run <files> --maxWorkers=1 --minWorkers=1`,
weight 1. Wait when the wrapper waits; a run killed with exit 129 or 137 is
not run: re-run it, never report it as passing.

## Locale

If the machine locale breaks tests that do not touch the change (a Turkish
locale breaks case-insensitive comparisons), re-run only the failed files
with `LC_ALL=en_US.UTF-8` added, and say so.

## Test integrity

Never weaken an existing test to make a change pass: do not shrink its data,
relax its expected values, or delete cases. If an expected value was wrong,
the commit that changes it says why.
