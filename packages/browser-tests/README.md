# browser-tests

To run browser tests in a local dev environment:

* make sure `localhost:9999` points to QuestDB Web Console
* run `cypress` through `yarn`:
```
yarn workspace browser-tests test
```

If you want to interact with cypress, you can start it like so:

```
yarn workspace browser-tests run cypress open
```
