#!/bin/bash -x

# Run it from the 'ui' directory as:
# ./run_browser_tests.sh

# You can also run it without building the QuestDB project (if it is already built):
# ./run_browser_tests.sh -skipQuestDBBuild

# Cleanup
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
PID1="$!"
echo "Proxy started, PID=$PID1"

# Switch dev mode on
export QDB_DEV_MODE_ENABLED=true

# Enable Materialized Views
export QDB_CAIRO_MAT_VIEW_ENABLED=true

# Running tests which assume authentication is off
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn workspace browser-tests test:auth
./tmp/questdb-*/bin/questdb.sh stop

read -p "Press any key to continue... " -n1 -s

# Switch OSS authentication on
export QDB_HTTP_USER=admin
export QDB_HTTP_PASSWORD=quest

# Running tests which assume that OSS authentication is on
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn workspace browser-tests test
./tmp/questdb-*/bin/questdb.sh stop

read -p "Press any key to continue... " -n1 -s

# Set context path
export QDB_HTTP_CONTEXT_WEB_CONSOLE=/context1

# Restart proxy to pickup context path
kill -SIGTERM $PID1
sleep 1
node packages/web-console/serve-dist.js &
PID2="$!"
echo "Proxy started, PID=$PID2"

# Running tests with context path
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn workspace browser-tests test
./tmp/questdb-*/bin/questdb.sh stop

# Stop proxy
kill -SIGTERM $PID2
