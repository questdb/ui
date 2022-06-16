# QuestDB Web Console

This package contains code of the GUI for interacting with QuestDB.

It is a web application built with TypeScript and React and managed with
Yarn@3 and Webpack.

## Local development setup

### TL;DR;

```
git clone git@github.com/questdb/ui.git
cd ui
docker run -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
yarn
yarn workspace @questdb/web-console start
```

## Prerequisites

* use node v16.13.1<br>
  version is specified in [`.nvmrc`](./.nvmrc) file. You can use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://fnm.vercel.app) to manage node versions on your machine.
* monorepo is managed with [yarn@3](https://yarnpkg.com/).<br>
  Follow [official installation guide](https://yarnpkg.com/getting-started/install). It should be enough to run `corepack enable` to have `yarn` enabled.
* This package is a frontend client for QuestDB. Therefore, it requires
  a locally running QuestDB instance. Check [readme.md](https://github.com/questdb/questdb#install-questdb) of QuestDB to learn how to install it.<br>
  If you have docker, then it's simply:
  ```
  docker run -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb
  ```

## Start development environment

1. Setup dependencies with yarn:

```
yarn
```

2. Start development environment

```
yarn workspace @questdb/web-console start
```

3. Open [localhost:9999](http://localhost:9999)

> make sure you have a local QuestDB instance running, as mentioned in
> "Prerequisites" above.

4. Happy hacking!

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
