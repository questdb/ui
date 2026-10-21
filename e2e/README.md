# E2E Tests (Cypress)

To run browser tests in a local dev environment:

- make sure `localhost:9999` points to QuestDB Web Console
- disable telemetry in QuestDB Web Console. Use env variable
  `QDB_TELEMETRY_ENABLED=false` if running with docker, you can pass the
  variable like this:

  ```
  docker run -e QDB_TELEMETRY_ENABLED=false -p 9000:9000 -p 9009:9009 questdb/questdb:latest
  ```

- run `cypress` through `yarn`:

```
yarn test:e2e          # console tests
yarn test:e2e:auth     # auth tests
yarn test:e2e:enterprise  # enterprise tests
```

If you want to interact with cypress, you can start it like so:

```
yarn cypress open
```

## Enterprise integration lane

The ordinary CI workflow always runs `e2e/tests/auth/*.spec.js`. These use
stubbed HTTP responses and cover token parsing (including string/zero expiry),
JSON 429/503 refresh failures, credential precedence, error focus/dismissal and
retrying the initial SQL check without requiring a licensed database.

Live EE builds and authentication fixtures belong in the **private Enterprise
repository**, following its JavaScript-client cross-repository lane. This
repository's `.github/workflows/enterprise_e2e.yml` only dispatches Azure; it
neither checks out Enterprise source nor downloads an EE binary.

One-time maintainer setup:

1. Register Enterprise's `ci/build-and-test-e2e-web-console.yaml` as the Azure
   pipeline `build-and-test-e2e-web-console` in the `questdb-enterprise`
   project. Authorize its existing `github-public-read` variable group and
   ensure the private lane's `GITHUB_TOKEN` can post commit statuses to
   `questdb/ui`.
2. Give the UI repository the Actions secret `ENT_DISPATCH_PAT`, scoped to Azure
   Build (Read & execute) with permission to queue that pipeline. It needs no
   access to the private GitHub repository or to Enterprise binaries.
3. Set the UI Actions variable `ENTERPRISE_E2E_ENABLED=true`.

Same-repository PRs, main pushes and manual runs dispatch the exact UI commit
SHA. Fork PRs never receive the PAT. Enterprise matches the UI branch when an EE
branch of the same name exists (otherwise uses main), builds EE with its
existing private test harness, and builds the public UI checkout at that SHA.
The private pytest driver runs `yarn test:e2e:enterprise` against a fresh EE
server, validates that invalid credentials are rejected, and supplies the
server-side userinfo fixture. Cypress still stubs browser code/token exchange.
The result is posted to the tested SHA as `enterprise-e2e-web-console`, even if
the PR head moves while tests run. A successful dispatch is **not** a passed
integration run: check that separate status.

One `oidc.spec.js` test leaves `/exec` unstubbed to check the tandem server
change (questdb#7799). After a reload installs a bearer that the userinfo
fixture rejects, the server answers 401 even though the browser still sends a
valid `qdb_session` cookie, and the console renews its token once and resends
once. The 401 also deleted the cookie, so the resend asks the server for a new
session: downloads authenticate with that cookie alone. ID-token bearers
(`acl.oidc.groups.encoded.in.token=true`) are tested only by unit and stubbed
browser tests: the lane would need a fixture that signs ID tokens.
`auth/auth.spec.js` replays that startup sequence with stubbed 401s, for both
bearer kinds, so the required auth lane covers the console side of it. It cannot
replace this lane: only a real server shows how the server responds.

For local runs, follow the Enterprise e2e README and set
`QDB_WEB_CONSOLE_DIR=/absolute/path/to/built/ui`, then run
`pytest -m web_console` in `questdb-ent/e2e`. The UI checkout needs
`yarn install --immutable`, `yarn build`, and a working Cypress installation
(`yarn cypress verify`). Ports 9000 and 9999 must be free; the harness owns and
tears down both services.
