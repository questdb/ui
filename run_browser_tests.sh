#!/bin/bash -x

# Run it from the 'ui' directory as:
# ./run_browser_tests.sh

# You can also run it without building the QuestDB project (if it is already built):
# ./run_browser_tests.sh -skipQuestDBBuild

rm -rf packages/browser-tests/cypress/snapshots/*
rm -rf tmp/dbroot
rm -rf tmp/questdb-*

if [[ $1 = "-skipQuestDBBuild" ]]
then
  echo "Skipping QuestDB build"
else
  mvn clean package -f packages/browser-tests/questdb/pom.xml -DskipTests -P build-binaries
fi

tar xzf packages/browser-tests/questdb/core/target/questdb-*-rt-*.tar.gz -C tmp/
mkdir tmp/dbroot

yarn install --immutable --immutable-cache
yarn workspace @questdb/react-components run build
yarn workspace @questdb/web-console run build

./tmp/questdb-*/bin/questdb.sh start -d ./tmp/dbroot
node packages/web-console/serve-dist.js &
PID="$!"
echo "Proxy started, PID=$PID"

yarn workspace browser-tests test

kill -SIGTERM $PID
./tmp/questdb-*/bin/questdb.sh stop
