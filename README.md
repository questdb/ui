# QuestDB UI

> Welcome to a WIP repository<br>
> The code here is not meant for public use.<br>
> Things are not stable and will change. Beware of dragons!

This repository is a monorepo hosting the implementation of QuestDB user
interface and surrounding tooling.

Currently hosting these packages:

* [`web-console`](./packages/web-console) - the GUI tool, shipped with QuestDB
* [`react-components`](./packages/react-components) - small component library for internal reuse between QuestDB products
* [`browser-tests`](./packages/browser-tests) - a utility based on cypress that helps to automate interactions and assert zero regressions
* [`screenshot-tests`](./packages/screenshot-tests) - a utility based on puppeteer that helps to automate taking screenshots of a website and comparing them between runs
