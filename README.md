# QuestDB UI

This repository hosts the implementation of QuestDB user interface and surrounding tooling.

## Prerequisites

- **Node.js** >= 18.18.0 (check with `node -v`)
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
- `yarn test:unit` - Run unit tests (Vitest)
- `yarn test:e2e` - Run end-to-end tests (Cypress)
- `yarn test:e2e:auth` - Run auth-specific e2e tests
- `yarn test:e2e:enterprise` - Run enterprise e2e tests
- `yarn typecheck` - Run TypeScript type checking
- `yarn lint` - Lint source code (ESLint)
- `yarn lint:fix` - Fix linting issues automatically

## Development Notes

### Running E2E Tests

E2E tests require a running QuestDB server. The tests connect to `localhost:9000` by default.

### Working with Context Path

To test with a custom context path:
```bash
QDB_HTTP_CONTEXT_WEB_CONSOLE=/context yarn preview
```

## Contributing

We always welcome contributions from the community!

If you need help, here are some useful links:

- Check [GitHub issues](https://github.com/questdb/ui/issues) for existing discussions
- Read the [QuestDB Documentation](https://questdb.com/docs/)
- Join our [Slack Channel](https://slack.questdb.io/) or [Community Forum](https://community.questdb.io/)
