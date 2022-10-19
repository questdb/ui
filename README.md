# QuestDB UI

This repository is a monorepo hosting the implementation of QuestDB user
interface and surrounding tooling.

Currently hosting these packages:

* [`web-console`](./packages/web-console) - the GUI tool, shipped with QuestDB
* [`react-components`](./packages/react-components) - small component library for internal reuse between QuestDB products
* [`browser-tests`](./packages/browser-tests) - a utility based on cypress that helps to automate interactions and assert zero regressions
* [`screenshot-tests`](./packages/screenshot-tests) - a utility based on puppeteer that helps to automate taking screenshots of a website and comparing them between runs

## Contributing

This monorepo is managed by Yarn@3 with
[Plug'n'Play](https://next.yarnpkg.com/features/pnp) enabled. It gives
us quick and reproducable builds but requires some specific setup for
IDEs.

Vim and VSCode should work out of the box. If they don't or you use some
other IDE, you might need to setup and SDK as explained in [Yarn
documentation](https://yarnpkg.com/getting-started/editor-sdks).
