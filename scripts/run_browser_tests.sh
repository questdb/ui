#!/bin/bash -x

# Run it from the 'scripts' subdirectory as:
# ./run_browser_tests.sh

# You can also run it without building the QuestDB project (if it is already built):
# ./run_browser_tests.sh -skipQuestDBBuild

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the parent directory (ui directory)
UI_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to UI directory
cd "$UI_DIR"

# QuestDB's maven enforcer needs the java25+ profile (JDK 25+) to activate; pin JDK 25 to match CI.
if [ -z "$JAVA_HOME" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"25'; then
  if [ -x /usr/libexec/java_home ]; then
    JAVA_HOME=$(/usr/libexec/java_home -v 25 2>/dev/null)
  fi
fi
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Error: could not locate JDK 25. Install one (e.g. 'brew install openjdk@25') or set JAVA_HOME." >&2
  exit 1
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

# Cleanup
rm -rf tmp/dbroot
rm -rf tmp/questdb-*

# Keep in sync with the submodule path in .gitmodules.
QUESTDB_DIR=test/e2e/questdb

# Build server
if [[ $1 = "-skipQuestDBBuild" ]]
then
  echo "Skipping QuestDB build"
else
  if [ ! -f "$QUESTDB_DIR/core/pom.xml" ]; then
    git submodule update --init --recursive "$QUESTDB_DIR"
  fi
  CLIENT_VERSION=$(grep -m1 -oE '<questdb\.client\.version>[^<]+' "$QUESTDB_DIR/core/pom.xml" | sed 's/.*>//')
  PROFILES=build-binaries
  if [[ "$CLIENT_VERSION" == *-SNAPSHOT ]]; then
    git submodule update --init --recursive "$QUESTDB_DIR"
    PROFILES=$PROFILES,local-client
  fi
  mvn clean package -e -f "$QUESTDB_DIR/pom.xml" -DskipTests -P "$PROFILES" 2>&1
fi

# Unpack server. Stop here if there is no build: the tests need a server.
if ! ls "$QUESTDB_DIR"/core/target/questdb-*-rt-*.tar.gz > /dev/null 2>&1; then
  echo "Error: no QuestDB archive in $QUESTDB_DIR/core/target. Check the build output above, or run without -skipQuestDBBuild." >&2
  exit 1
fi
tar xzf "$QUESTDB_DIR"/core/target/questdb-*-rt-*.tar.gz -C tmp/
mkdir tmp/dbroot

# Build web console
yarn install --immutable
yarn build

# Start proxy. Run vite directly: with `yarn preview`, $! is the yarn wrapper
# and killing it leaves the server holding port 9999.
node_modules/.bin/vite preview &
PID1="$!"
echo "Proxy started, PID=$PID1"

# Switch dev mode on
export QDB_DEV_MODE_ENABLED=true
export QDB_TELEMETRY_ENABLED=false

# Running tests which assume authentication is off
rm -rf tmp/dbroot/*
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn test:e2e:auth
./tmp/questdb-*/bin/questdb.sh stop

read -p "Press any key to continue... " -n1 -s

# Switch OSS authentication on
export QDB_HTTP_USER=admin
export QDB_HTTP_PASSWORD=quest
export QDB_TELEMETRY_ENABLED=false

# Running tests which assume that OSS authentication is on
rm -rf tmp/dbroot/*
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn test:e2e
./tmp/questdb-*/bin/questdb.sh stop

read -p "Press any key to continue... " -n1 -s

# The context-path check runs without the proxy: QuestDB serves the built
# console itself, so a request that drops the prefix fails. Matches CI.
kill -SIGTERM $PID1

CONTEXT_PATH=/ci/console
export QDB_HTTP_CONTEXT_WEB_CONSOLE=$CONTEXT_PATH
export QDB_HTTP_STATIC_PUBLIC_DIRECTORY="$UI_DIR/dist"

# Running tests with context path
rm -rf tmp/dbroot/*
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
curl --retry 30 --retry-connrefused --retry-delay 1 --fail --silent --show-error \
  --output /dev/null "http://localhost:9000$CONTEXT_PATH/settings"
CYPRESS_BASE_URL="http://localhost:9000$CONTEXT_PATH" yarn test:e2e:context
./tmp/questdb-*/bin/questdb.sh stop
