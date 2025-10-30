# QuestDB UI

This repository hosts the implementation of QuestDB user interface and surrounding tooling.

## Local development setup

In order to start working with this repo, you first need to clone and bootstrap it.

It is a simple process! Follow these steps:

1. Clone the repository
2. Bootstrap dependencies
3. Run command
4. Hack!

Each step is described in below.

### 1. Clone the repository

There are few ways to clone a repository. Check [Github docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) if you need help.

- Clone this repository using SSH:

  ```
  git clone git@github.com:questdb/ui.git
  ```

- or HTTPS:

  ```
  git clone https://github.com/questdb/ui.git
  ```

- or with [Github CLI](https://cli.github.com/):
  ```
  gh repo clone questdb/ui
  ```

### 2. Bootstrap dependencies

#### `node` and `yarn`

First make sure you have `node` and `yarn` and that their versions are compatible with this project.
This is a common source of issues, best not to skip this step:

- `node -v` should return a version compatible with what's in [.nvmrc](../.nvmrc)\
  If it doesn't, you can use [fnm](https://fnm.vercel.app) or [nvm](https://github.com/nvm-sh/nvm) to manage node versions on your machine.\
  Then run `fnm use` or `nvm use` to set correct version.

- If `yarn -v` returns `command not found`, enable `yarn` by running `corepack enable`.\
  Follow [official installation guide](https://yarnpkg.com/getting-started/install) if you have trouble.

#### Bootstrap

Simply run `yarn` to bootstrap.

### 3. Run command of a package

Congrats, the setup is done! You're ready to start working on web console.

```
yarn $script
```

where `$script` is one of the scripts defined in `package.json` file.

- You can start web console development server with:

```
yarn start
```

[localhost:9999](http://localhost:9999) should display the web console.

- You can run unit tests using:

```
yarn test:unit
```


- You can run e2e tests using:

```
yarn test:e2e
```

Note that you need to run QuestDB server for testing web console.
There are useful scripts

### 4. Hack!

The setup is done! 

If you need help, here are some useful links:

- [GitHub issues](https://github.com/questdb/ui/issues), might already have an answer to your question
- [QuestDB Documentation](https://questdb.com/docs/) includes a lot of useful information
- [QuestDB Slack Channel](https://slack.questdb.io/) and [QuestDB Community Forum](https://community.questdb.io/): join our helpful community!


## Contributing

We always welcome contributions from the community!

Please, read our [local development setup](./docs/local-development-setup.md) document to learn how to get started.
