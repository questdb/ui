# QuestDB UI

> Welcome to a WIP repository!
> The code here is not (yet) meant for public use. Things are not stable
> and will change. Beware of dragons!

This repository is a monorepo hosting the implementation of QuestDB user interface and surrounding tooling.

Currently hosting three packages:

* `screenshot-tests` - a utility based on puppeteer that helps to automate taking screenshots of a website and comparing them between runs
* `browser-tests` - a utility based on cypress that helps to automate interactions and assert zero regressions
* `react-components` - small component library for internal reuse between QuestDB products
