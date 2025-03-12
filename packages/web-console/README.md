# QuestDB Web Console

This package contains code of the GUI for interacting with QuestDB.

It is a web application built with TypeScript and React and managed with
Yarn@3 and Webpack.

## Local development setup

In order to run this package locally, follow the steps below.

### 1. Clone and bootstrap repository

Follow the instructions described
in [`local-development-setup.md`](../../docs/local-development-setup.md) document.\
After the local development environment setup, you are ready to work on the packages of this project,
including the web console.

### 2. Build the production version of `@questdb/react-components`

The web console uses the `@questdb/react-components` package, so build this dependency first.
```
yarn workspace @questdb/react-components build
```

### 3. Start development server

Now we can start the web console.
```
yarn workspace @questdb/web-console start
```

By default, [localhost:9999](http://localhost:9999) should display the web console.

If the server has a context path configured with the `http.context.path` option, we need to make sure that
the dev server is aware of it, and it proxies requests accordingly.\
We can set the context path with the following environment variable before starting dev server:
```
QDB_HTTP_CONTEXT_WEB_CONSOLE=/instance2
export QDB_HTTP_CONTEXT_WEB_CONSOLE
yarn workspace @questdb/web-console start
```

After the above the web console is available on [localhost:9999/instance2/](http://localhost:9999/instance2/)

If the context path is removed from the server configuration, we also need to clear the environment variable,
and restart the dev server:
```
unset QDB_HTTP_CONTEXT_WEB_CONSOLE
yarn workspace @questdb/web-console start
```

### 4. Run QuestDB in the background

This package (`web-console`) is a GUI for QuestDB, it does not include QuestDB itself.\
The web console will load from the dev server without the database, but because it is a tool
to interact with QuestDB, you need to run the database as well to be able to work with it
properly.

Check [README.md](https://github.com/questdb/questdb#install-questdb) of QuestDB to learn how to install it.

If you have [`docker`](https://docs.docker.com/get-docker/), then it is simply:

```
docker run -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
```

### 5. Hack!

You can start changing the code, and the web console will automatically refresh
on [localhost:9999](http://localhost:9999).

Happy hacking!

## Build production version

1. Make sure dependencies are set up:

```
yarn
```

2. Run `build` script:

```
yarn workspace @questdb/web-console run build
```

3. Build process emits static HTML, CSS and JS files in `packages/web-console/dist`

## Bundle size watcher
Web Console uses [BundleWatcher](https://github.com/bundlewatch/bundlewatch) to make sure there is no unintentional blowup of assets size. The current limits, defined in the `package.json`, are as following:


| File | Max allowed size |
|--------|--------|
| dist/vendor.*.js | 3MB |
| dist/qdb.*.js | 500KB |
| dist/qdb.*.css | 100KB |
| dist/vendor.*.css | 100KB | 

If you need to introduce a heavy library or anything that by design is expected to go over the defined limits, make sure to change the watcher configuration.

## Run tests

### Unit tests

This package uses [Jest](https://jestjs.io/) for unit tests.

To run them locally while developing, run:

```
yarn workspace @questdb/web-console run test
```

This will start jest in watch mode and will rerun tests on file changes.

If you want to run tests once, use:

```
yarn workspace @questdb/web-console run test:prod
```

This command is also used in CI.

### Browser tests

This monorepo contains `browser-tests` package which is used to test
`web-console` package. `browser-tests` does not yet run as part of
`web-console` build on CI, but they can be used to test changes locally.

Tests are written with [Cypress](https://www.cypress.io/) E2E framework.

1. start `web-console` local dev environment as explained above in this document.
2. run tests with
  ```
  yarn workspace browser-tests test
  ```

  or

  ```
  yarn workspace browser-tests run cypress open
  ```
