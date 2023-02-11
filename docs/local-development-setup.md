# Local development setup

In order to start working on any package in this monorepo, you first need to clone and bootstrap it.

It is a simple process! Follow these steps:

1. Clone the repository
2. Bootstrap dependencies
3. Run command of a package
4. Hack!

Each step is described in below.

### 1. Clone the repository

There are few ways to clone a repository. Check [Github docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) if you need help.

* Clone this repository using SSH:
  ```
  git clone git@github.com:questdb/ui.git
  ```

* or HTTPS:
  ```
  git clone https://github.com/questdb/ui.git
  ```

* or with [Github CLI](https://cli.github.com/):
  ```
  gh repo clone questdb/ui
  ```

You will notice that cloning takes some time. This is expected, because we use [Yarn@3 with PnP](https://next.yarnpkg.com/features/pnp) (plug and play).

All dependencies are stored in the repository, and there is no need to install (download) them separately.
It takes ~1 minute to download on a decent connection. After that there's no more downloading and bootstrapping is very quick!

It does feel a bit strange to have dependencies committed, but it's a well worth trade-off. If you're interested in learning more, check out [Yarn@3 with PnP](https://yarnpkg.com/features/pnp) and [Zero-Installs](https://yarnpkg.com/features/zero-installs).

### 2. Bootstrap dependencies

Make sure you have `node` and `yarn` and that their versions are compatible with this project:

* `node -v` should return `16.13.1`\
  If it doesn't, you can use [fnm](https://fnm.vercel.app) or [nvm](https://github.com/nvm-sh/nvm) to manage node versions on your machine.\
  Then run `fnm use` or `nvm use` to set correct version.

* `yarn -v` should return v3 (like `3.2.1`).\
  If it returns `command not found`, enable `yarn` by running `corepack enable`.\
  Follow [official installation guide](https://yarnpkg.com/getting-started/install) if you have trouble.
  
* run `yarn` to bootstrap dependencies. This should be a quick process (less than a minute).

### 3. Run command of a package

Congrats, the setup is done! You're ready to start working on **any** package in `packages` folder.

Pick any package from `packages` directory. To run a script for it, use a command in this format:

```
yarn workspace $package-name $script
```

where:

* `$package-name` is the `"name"` property in package's `package.json` file.\
   For example, [`packages/web-console/package.json`](../packages/web-console/package.json) has `"name": "@questdb/web-console"`.

* `$script` is one of the scripts defined in package's `package.json` file.\
   For example, [`packages/web-console/package.json`](../packages/web-console/package.json) has `"scripts"` which has `"start"`

Knowing this it's easy to run any script of any package.

If you want to work on `@questdb/web-console` package, you can start its development server with:

```
yarn workspace @questdb/web-console start
```

[localhost:9999](http://localhost:9999) should show web console.

### 4. Hack!

The setup is done! All packages are ready to be worked on.

They all have a `readme.md` with more details, for instance, here's a link to [`@questdb/web-console/readme.md`](../packages/web-console/readme.md).

Vim and VSCode should work out of the box. If they don't or you use some
other IDE, you might need to setup and SDK as explained in [Yarn
documentation](https://yarnpkg.com/getting-started/editor-sdks).

If you need help, here are some useful links:

* [Github issues](https://github.com/questdb/ui/issues), might already have an answer to your question
* [QuestDB Documentation](https://questdb.io/docs/) includes a lot of useful information
* [QuestDB Slack](https://slack.questdb.io/) join our helpful community!
