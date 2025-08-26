# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

QuestDB UI is a monorepo hosting the implementation of QuestDB user interface and surrounding tooling using TypeScript, React, and Yarn 3 with PnP (Plug and Play).

### Package Structure

- `@questdb/web-console` - The main GUI application for QuestDB
- `@questdb/react-components` - Shared component library for internal reuse
- `browser-tests` - Cypress-based browser tests

## Common Development Commands

### Initial Setup
```bash
# Clone and bootstrap (dependencies are committed via Yarn PnP)
yarn

# Build react-components first (required dependency)
yarn workspace @questdb/react-components build
```

### Web Console Development
```bash
# Start development server (runs on localhost:9999)
yarn workspace @questdb/web-console start

# Build production version
yarn workspace @questdb/web-console build

# Run unit tests (watch mode)
yarn workspace @questdb/web-console test

# Run unit tests (CI mode)
yarn workspace @questdb/web-console test:prod
```

### React Components Development
```bash
# Start Storybook
yarn workspace @questdb/react-components storybook

# Build library
yarn workspace @questdb/react-components build
```

### Browser Tests
```bash
# Run browser tests (requires web-console running)
yarn workspace browser-tests test

# Run auth tests
yarn workspace browser-tests test:auth

# Run enterprise tests
yarn workspace browser-tests test:enterprise
```

### Running QuestDB Backend
The web console requires QuestDB running in the background:
```bash
docker run -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
```

## Architecture Overview

### Web Console Structure

The web console (`packages/web-console/src/`) follows a layered architecture:

1. **Entry Points**
   - `index.tsx` - React application bootstrap
   - `index.html` - HTML template

2. **State Management**
   - Redux store with epics (redux-observable)
   - Store modules: `Console`, `Query`, `Telemetry`
   - Database persistence with Dexie.js

3. **Core Scenes/Features**
   - `Console` - Main SQL query interface
   - `Editor` - Monaco-based SQL editor with QuestDB-specific language support
   - `Schema` - Database schema browser with virtual table support
   - `Import` - CSV file import functionality
   - `Result` - Query result visualization
   - `Metrics` - System metrics visualization with uPlot

4. **Provider Hierarchy**
   - `QuestProvider` - QuestDB client services
   - `LocalStorageProvider` - Persistent settings
   - `AuthProvider` - Authentication handling
   - `SettingsProvider` - Application settings
   - `PosthogProviderWrapper` - Analytics

5. **Component Organization**
   - Reusable components in `components/`
   - Scene-specific components within each scene directory
   - Shared hooks in `Hooks/`
   - Form components with Joi validation schemas

### Key Technologies

- **UI Framework**: React 17 with TypeScript
- **Styling**: Styled-components + SCSS
- **State**: Redux + Redux-Observable (RxJS)
- **Editor**: Monaco Editor with custom QuestDB SQL language
- **Charts**: uPlot for time-series, ECharts for general visualizations
- **Forms**: React Hook Form with Joi validation
- **Storage**: Dexie.js for IndexedDB persistence
- **Build**: Webpack 5 with Babel

### Development Notes

- Node version: 16.13.1 (use fnm/nvm)
- Yarn version: 3.x (enabled via corepack)
- All dependencies are committed (Yarn Zero-Installs)
- TypeScript version locked at 4.4.4
- Bundle size limits enforced via BundleWatch

### Testing Approach

- Unit tests: Jest with React Testing Library
- Browser tests: Cypress for E2E testing
- Time zone: Tests run with TZ=UTC
