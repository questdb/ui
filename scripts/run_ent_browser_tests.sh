#!/bin/bash -x

# Run it from the 'scripts' subdirectory as:
# ./run_ent_browser_tests.sh [--cached]
# Java 25 is required (questdb-enterprise maven enforcer needs the java25+
# profile to activate). The script auto-selects JDK 25 from the system.
# Override by exporting JAVA_HOME and/or MVN_REPO before running.
# --cached: reuse the tmp/questdb-enterprise clone and maven build from the
# previous run (falls back to cloning/building if missing). Always wipes tmp/dbroot.

# Parse args
CACHED=0
for arg in "$@"; do
    case "$arg" in
        --cached) CACHED=1 ;;
    esac
done

# Auto-select JDK 25 if JAVA_HOME isn't already set to one
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

# Default maven local repo
if [ -z "$MVN_REPO" ]; then
    MVN_REPO="$HOME/.m2/repository"
fi
export MVN_REPO

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the parent directory (ui directory)
UI_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to UI directory
cd "$UI_DIR"

# Cleanup
rm -rf tmp/dbroot
if [ "$CACHED" -eq 0 ]; then
    rm -rf tmp/questdb-*
fi

# Clone questdb-enterprise (skip if cached clone exists)
if [ -d tmp/questdb-enterprise/.git ]; then
    echo "Reusing existing tmp/questdb-enterprise checkout"
else
    git clone https://github.com/questdb/questdb-enterprise.git tmp/questdb-enterprise
    cd tmp/questdb-enterprise || exit 1
    git submodule init
    git submodule update
    cd ../..
fi

# Build server (skip if cached classes exist)
ENT_MAIN_CLASS=tmp/questdb-enterprise/questdb-ent/target/classes/com/questdb/EntServerMain.class
CORE_MAIN_DIR=tmp/questdb-enterprise/questdb/core/target/classes
if [ "$CACHED" -eq 1 ] && [ -f "$ENT_MAIN_CLASS" ] && [ -d "$CORE_MAIN_DIR" ]; then
    echo "Reusing existing maven build output"
else
    mvn clean package -e -f tmp/questdb-enterprise/pom.xml -DskipTests -P build-ent-binaries 2>&1
fi

# Create dbroot
mkdir tmp/dbroot

# Build web console
yarn install --immutable
yarn build

# Start proxy
yarn preview &
PID1="$!"
echo "Proxy started, PID=$PID1"

# Switch dev mode on
export QDB_DEV_MODE_ENABLED=true
export QDB_TELEMETRY_ENABLED=false

# OIDC config
export QDB_ACL_OIDC_ENABLED=true
export QDB_ACL_OIDC_TLS_ENABLED=false
export QDB_ACL_OIDC_GROUPS_CLAIM=groups
export QDB_ACL_OIDC_CLIENT_ID=clientId
export QDB_ACL_OIDC_HOST=localhost
export QDB_ACL_OIDC_PORT=9999
export QDB_ACL_OIDC_USERINFO_ENDPOINT=/userinfo

# Clean dbroot
rm -rf tmp/dbroot/*

# Running enterprise tests
echo $JAVA_HOME
echo $MVN_REPO
CORE_CLASSES=tmp/questdb-enterprise/questdb/core/target/classes
ENT_CLASSES=tmp/questdb-enterprise/questdb-ent/target/classes
JAR_JNI=org/questdb/jar-jni/1.1.1/jar-jni-1.1.1.jar

$JAVA_HOME/bin/java -cp $CORE_CLASSES:$ENT_CLASSES:$MVN_REPO/$JAR_JNI com.questdb.EntServerMain -d tmp/dbroot &
PID2="$!"
yarn test:e2e:enterprise
kill -SIGTERM $PID2

# Stop proxy
kill -SIGTERM $PID1
