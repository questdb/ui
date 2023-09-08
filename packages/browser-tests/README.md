# browser-tests

To run browser tests in a local dev environment:

* make sure `localhost:9999` points to QuestDB Web Console
* disable telemetry in QuestDB Web Console. Use env variable `QDB_TELEMETRY_ENABLED=false`
  if running with docker, you can pass the variable like this:
  ```
  docker run -e QDB_TELEMETRY_ENABLED=false -p 9000:9000 -p 9009:9009 questdb/questdb:latest
  ```

* run `cypress` through `yarn`:
```
yarn workspace browser-tests test
```

If you want to interact with cypress, you can start it like so:

```
yarn workspace browser-tests run cypress open
```

## Screenshot matching

This package uses [simonsmith/cypress-image-snapshot](https://github.com/simonsmith/cypress-image-snapshot). It adds a `cy.matchImageSnapshot()` command to Cypress.

To take a screenshot while running tests, use `cy.matchImageSnapshot()`.
This will take a screenshot and save it in relevant location (depending
on test name) in `browser-tests/cypress/snapshots`.

On the next run, `cy.matchImageSnapshot()` will compare the screenshot with the one saved in `snapshots` and fail the test if they don't match.

If you want to update the screenshot, run `yarn workspace browser-tests test:update`
