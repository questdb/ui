# QuestDB UI

This repository hosts the implementation of QuestDB user interface and surrounding tooling.

## Prerequisites

- **Node.js** 24 (see `package.json` for other supported versions; check with `node -v`)
- **Yarn** 4.1.1+ (check with `yarn -v`)

If your Node.js version doesn't match, use [fnm](https://fnm.vercel.app) or [nvm](https://github.com/nvm-sh/nvm) to switch versions:
```bash
fnm use  # or nvm use
```

If Yarn is not installed, enable it with:
```bash
corepack enable
```

## Quick Start

1. Clone the repository:
   ```bash
   git clone git@github.com:questdb/ui.git
   cd ui
   ```

2. Install dependencies:
   ```bash
   yarn
   ```

3. Start the development server:
   ```bash
   yarn start
   ```

4. Open [http://localhost:9999](http://localhost:9999) in your browser. Note that for Web Console to work properly, [QuestDB server](https://github.com/questdb/questdb) should be up and running.

## Available Scripts

- `yarn start` - Start development server (Vite)
- `yarn build` - Build for production
- `yarn preview` - Preview production build locally
- `yarn test` - Run all unit, component, and integration tests (Vitest)
- `yarn test:unit` - Run unit and isolated hook tests (Vitest)
- `yarn test:component` - Run component tests (Vitest)
- `yarn test:integration` - Run cross-module tests (Vitest)
- `yarn test:e2e` - Run end-to-end tests (Cypress)
- `yarn test:e2e:context` - Run context-path E2E checks against QuestDB
- `yarn test:e2e:auth` - Run auth-specific e2e tests
- `yarn test:e2e:enterprise` - Run enterprise e2e tests
- `yarn typecheck` - Run TypeScript type checking
- `yarn lint` - Lint source code (ESLint)
- `yarn lint:fix` - Fix linting issues automatically
- `yarn sync:questdb` - Move the `test/e2e/questdb` submodule to the head of QuestDB `master` and stage it

## Development Notes

### Test Organization

Keep unit and component tests beside their source files. Use a clear subject
name that matches the source, such as `textSearch.test.ts` or
`SearchPanel.test.tsx`. For `index.tsx`, use the exported component name.
Group cases for one source in that file. Do not add category suffixes.

- Unit tests use `.test.ts` or `.test.js`. Isolated hook tests also belong here;
  name them after the hook (`useSomething.test.tsx` when JSX is needed).
- Component tests use `.test.tsx` or `.test.jsx` and test rendered UI behavior.
- Cross-module tests live under `test/integration`, grouped by feature.
- Browser journeys live under `test/e2e`, grouped by feature.

Use React Testing Library for new component and hook tests. Add
`@vitest-environment jsdom` when a test needs the DOM. This environment does
not decide its category. Do not add Cypress mount tests.

`yarn test` runs all Vitest tests once. The separate Vitest workflow needs no
app build or QuestDB server. Each category also has its own command above.

### Running E2E Tests

E2E tests use the preview server at `localhost:9999`, which forwards API requests
to QuestDB at `localhost:9000`. The E2E workflow builds both once and runs the
auth and console suites. It then restarts QuestDB with a context path and runs
only `contextPath.spec.js`.

### QuestDB Submodule

CI builds the QuestDB server for E2E tests from the `test/e2e/questdb` submodule. The "Check OSS Submodule" workflow fails a push when the submodule is not one of the latest commits of QuestDB `master`. To fix it, run:

```bash
yarn sync:questdb
```

Then commit the staged `test/e2e/questdb` change. The first run clones the submodule if it is not initialized yet.

To test against a QuestDB branch that is not merged yet, check out that commit in `test/e2e/questdb` and commit the pointer as usual. Run `yarn sync:questdb` before merging.

### Working with Context Path

Build the app with `yarn build`. Start QuestDB with these environment variables:

```bash
export QDB_HTTP_CONTEXT_WEB_CONSOLE=/ci/console
export QDB_HTTP_STATIC_PUBLIC_DIRECTORY=/absolute/path/to/ui/dist
export QDB_HTTP_USER=admin
export QDB_HTTP_PASSWORD=quest
export QDB_DEV_MODE_ENABLED=true
```

Then run:

```bash
CYPRESS_BASE_URL=http://localhost:9000/ci/console yarn test:e2e:context
```

QuestDB must serve the built app directly. This checks redirects, asset loading,
and API routes without a preview proxy that could hide incorrect URLs.
The spec covers login/logout, settings, SQL, CSV import/export, shared links,
MCP pairing, AI loading, and notebook regex loading. Only external services use
mocks. OIDC redirect and callback paths also have RTL coverage.

## Contributing

We always welcome contributions from the community!

If you need help, here are some useful links:

- Check [GitHub issues](https://github.com/questdb/ui/issues) for existing discussions
- Read the [QuestDB Documentation](https://questdb.com/docs/)
- Join our [Slack Channel](https://slack.questdb.io/) or [Community Forum](https://community.questdb.io/)
