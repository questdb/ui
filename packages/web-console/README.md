# QuestDB Web Console

This package contains code of the GUI for interacting with QuestDB.

It is a web application built with TypeScript and React and managed with
Yarn@3 and Webpack.

## Local development setup

You need to do the following steps:

1. Clone the repository
2. Bootstrap dependencies
3. Start development server
4. Run QuestDB in the background
5. Hack!

The setup is fairly quick!

### 1. Clone the repository

Choose your favorite method to clone this repository to your machine.\
The repository is about 250MB in size. This is expected, because we use [Yarn@3 with PnP](https://next.yarnpkg.com/features/pnp).\
Cloning (downloading) takes the most amount of time (~1 minute on a decent network connection).

* clone using SSH:
  ```
  git clone git@github.com/questdb/ui.git
  ```

* or using HTTPS:
  ```
  git clone git@github.com/questdb/ui.git
  ```

* or using [Github CLI](https://cli.github.com/):
  ```
  gh repo clone questdb/ui
  ```

### 2. Bootstrap dependencies

* `node -v` should return `16.13.1`\
  If it doesn't, you can use [fnm](https://fnm.vercel.app) or [nvm](https://github.com/nvm-sh/nvm) to manage node versions on your machine.\
  Then run `fnm use` or `nvm use` to set correct `node` version.

* `yarn -v` should return v3 (like `3.2.1`).\
  If it returns `command not found`, enable `yarn` with by running `corepack enable`.\
  Follow [official installation guide](https://yarnpkg.com/getting-started/install) if you have troubles.
  
* run `yarn` to bootstrap dependencies. This should be a quick process (less than a minute).

### 3. Start development server

Initiate a webpack dev server by running this command:

```
yarn workspace @questdb/web-console start
```

[localhost:9999](http://localhost:9999) should show web console

### 4. Run QuestDB in the background

This package is a GUI for QuestDB but it does not include QuestDB itself.
GUI will work even without QuestDB, but since it's a tool for
interacting with QuestDB, you will most likely want QuestDB running in
the background.

Check [readme.md](https://github.com/questdb/questdb#install-questdb) of QuestDB to learn how to install it.\
Or, if you have [`docker`](https://docs.docker.com/get-docker/), then it's simply:

```
docker run -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
```

### 5. Hack!

Do your changes. Browser will automatically refresh [localhost:9999](http://localhost:9999).

Happy hacking!

## Run build 

1. Make sure dependencies are set up:

```
yarn
```

2. Run `build` script:

```
yarn workspace @questdb/web-console run build
```

3. Build process emits static HTML, CSS and JS files in `packages/web-console/dist`

## Run tests

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
