#!/bin/bash -x

# Run it from the 'ui' directory as:
# ./run_browser_tests.sh

# You can also run it without building the QuestDB project (if it is already built):
# ./run_browser_tests.sh -skipQuestDBBuild

# Cleanup
rm -rf packages/browser-tests/cypress/snapshots/*
rm -rf tmp/dbroot
rm -rf tmp/questdb-*

# Build server
if [[ $1 = "-skipQuestDBBuild" ]]
then
  echo "Skipping QuestDB build"
else
  mvn clean package -e -f packages/browser-tests/questdb/pom.xml -DskipTests -P build-binaries 2>&1
fi

# Unpack server
tar xzf packages/browser-tests/questdb/core/target/questdb-*-rt-*.tar.gz -C tmp/
mkdir tmp/dbroot

# Build web console
yarn install --immutable --immutable-cache
yarn workspace @questdb/react-components run build
yarn workspace @questdb/web-console run build

# Start proxy
node packages/web-console/serve-dist.js &
PID="$!"
echo "Proxy started, PID=$PID"

# Switch dev mode on
export QDB_DEV_MODE_ENABLED=true

# Running tests which assume authentication is switched off
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn workspace browser-tests test:auth
./tmp/questdb-*/bin/questdb.sh stop

# Switch authentication on
export QDB_HTTP_USER=admin
export QDB_HTTP_PASSWORD=quest

# Running tests which assume authentication is switched on
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn workspace browser-tests test
./tmp/questdb-*/bin/questdb.sh stop

# Stop proxy
kill -SIGTERM $PID
