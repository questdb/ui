# QuestDB UI

This repository is a monorepo hosting the implementation of QuestDB user
interface and surrounding tooling.

Currently there are these packages:

* [`web-console`](./packages/web-console/readme.md) - the GUI tool shipped with QuestDB
* [`react-components`](./packages/react-components/readme.md) - small component library for internal reuse between QuestDB products
* [`browser-tests`](./packages/browser-tests/readme.md) - a utility based on cypress that helps to automate interactions and assert zero regressions
* [`screenshot-tests`](./packages/screenshot-tests/readme.md) - a utility based on puppeteer that helps to automate screenshot taking of a website and compare them between runs

## Contributing

We always welcome contributions from the community!

Please read our [local development setup](./docs/local-development-setup.md) document to learn how to get started.
