# PR #603 — description draft

This is a replacement PR description for the complete change set, including the
local review follow-up. Apply it to GitHub when the follow-up is pushed; the
local test results below do not describe the previously pushed head.

## Summary

Fix the Web Console hanging indefinitely when an SSO token refresh fails, and
make query execution and notebook persistence respect the authentication session
that started the work.

Refreshing is shared across SQL consumers, cancellable and bounded. Queries
normally wait up to 10 seconds; a rotating refresh request can continue until
its separate hard deadline (at most 60 seconds). A server-side 401 recovery
waits for that request rather than cancelling a potentially usable rotated
refresh token.

Transient transport, timeout, HTTP 429 and 5xx failures back off without forcing
logout. Once the bearer expires, SQL is not sent until renewal succeeds. The
console reports that explicitly, rather than reporting a database outage or
telling an agent that a never-sent write may have committed. An authoritative
OAuth rejection still returns the user to sign-in.

## Complete scope

- **Authentication and token installation:** strict token-response parsing;
  optional expiry handling; ID-token bearer expiry; refresh-token rotation;
  missing required ID-token errors; callback URL restoration; tab-local session
  generations; stable provider callbacks and subscription cleanup.
- **Query client:** one shared console/telemetry client; send-time authorization
  for SQL, validation, import and preferences requests; bounded refresh waits;
  one safe retry after a rejected bearer; session-aware result/error fencing;
  explicit session-ended and not-sent outcomes.
- **Session teardown:** clear client credentials and refresh callbacks, abort
  live queries, cancel delayed telemetry polls, and reset active/pending query
  confirmations (including confirmations already waiting for cancellation).
- **Editor and notifications:** transient, query-id-indexed LOADING state is
  excluded from notification history; settled/superseded loading notifications
  are cleaned up; the notification Stop button only cancels its own execution;
  scripts preserve confirmed outcomes and report partial completion on logout.
  Script teardown is shared, without an extra settlement dispatch per statement.
- **Notebook execution and storage:** fence live, headless and refresh work;
  separate layout-phase detachment from passive destruction; flush frames
  accepted before logout while discarding late responses; atomically save
  accepted headless metadata/snapshots; recover with metadata-only persistence
  when a large snapshot aborts the root transaction. Byte capping runs before
  acquiring the buffer write lock. Search updates publish only after root
  commit.
- **Catalog sources:** separate SQL lifecycle hooks from wire options and give
  refresh waits and SQL requests their own deadline budgets. Catalog code
  receives the refresh budget from the client rather than importing coordinator
  internals.
- **Legacy result grid:** generation-fence delayed rendering and pagination so
  an older page cannot replace the current result; expose recycled row indices
  to the stale-page regression test and document result-specific layout restore.
- **Request limiter:** use a linked FIFO queue with constant-time cancellation
  of queued requests, preserving concurrency limits and ordering.
- **Recovery, toast and login UX:** centred, danger-styled recovery UI; focus
  its heading and transfer focus into the recovered console; preserve Retry
  focus while busy; focus/describe sign-in errors; keep toast announcements
  available outside the SQL gate and during dialogs; use live theme tokens; warn
  both before and after token expiry; prevent incidental click dismissal;
  restore a dismissed warning on subsequent failures; provide expiry
  information, a sign-in action and Alt+N keyboard access. Renewal failures use
  consistent copy.
- **Test infrastructure and dependencies:** add React 17 test-renderer and its
  types; extend unit and stubbed browser regressions; allowlist fake test tokens
  in gitleaks; update the QuestDB E2E submodule (24 server commits, including
  permission-aware table visibility).
- **Enterprise CI:** add `.github/workflows/enterprise_e2e.yml`, an opt-in Azure
  dispatch using `vars.ENTERPRISE_E2E_ENABLED` and `secrets.ENT_DISPATCH_PAT`.
  Fork PRs do not receive that secret. Private Enterprise source, binaries and
  live fixtures remain in the private repository. Dispatch success is not a
  passing integration result: check `enterprise-e2e-web-console` for the tested
  SHA. Setup and local execution are documented in `e2e/README.md`.

## Review follow-up coverage

| Review items      | Resolution                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1, #8, #23       | Preserve confirmed script notifications; one shared finish path; settle LOADING once per script.                                                                                                                                                     |
| #2, #5, #6        | Explicit not-sent renewal errors; no transient-failure logout threshold; retain pending 401 refresh recovery through its hard deadline.                                                                                                              |
| #3, #9            | Prepare byte-capped snapshots before the write transaction; retry metadata-only storage and warn after root abort.                                                                                                                                   |
| #4, #7            | Fence every live run generation; preserve error metadata; flush accepted throttled frames before session invalidation.                                                                                                                               |
| #10, #11          | Reset confirmation state and invalidate waiting confirmations; clear shared credentials and cancel old telemetry timers.                                                                                                                             |
| #12–#15           | Test current rotated tokens, loading-notification cancellation, root-commit search publication and deterministic loading cleanup.                                                                                                                    |
| #16–#20           | Focused/centred recovery UI, actionable persistent toast with keyboard access, consistent renewal wording and simpler toast specificity.                                                                                                             |
| #21, #22, #24–#28 | Shared session handles/error guards; central authorization; pure token normalization; separate lifecycle options; remove unused helpers/reset hooks/payload fields; accurate local-error and commit-outcome types; clearer names/constants/comments. |
| #29               | Document every shipped concern, the secret-using CI workflow and current validation results here, rather than describing this as only a refresh-loop change.                                                                                         |

## Validation

Local follow-up validation:

- `yarn typecheck` — passed.
- `yarn lint` — passed, including color-token checks.
- `yarn build` — passed (existing bundle-size advisory remains).
- `yarn test:unit` — 2,838 tests in 148 files.
- `yarn cypress run --spec 'e2e/tests/auth/auth.spec.js' --browser electron` —
  38 passed against the production preview with stubbed HTTP responses.
- The full console E2E suite and live Enterprise OIDC lane were not run locally.

Earlier counts in the old description were checkpoints of earlier revisions, not
the final suite size. Live IdP/Enterprise integration still requires the private
lane; the stubbed auth suite is not a substitute for it.
