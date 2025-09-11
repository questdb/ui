#!/bin/bash -x

# Run it from the 'ui' directory as:
# JAVA_HOME=<your java> MVN_REPO=<your maven repo> ./run_ent_browser_tests.sh
# Example: JAVA_HOME=/opt/homebrew/opt/openjdk@17 MVN_REPO=/Users/john/.m2/repository ./run_ent_browser_tests.sh

# Cleanup
rm -rf tmp/dbroot
rm -rf tmp/questdb-*

# Clone questdb-enterprise
git clone https://github.com/questdb/questdb-enterprise.git tmp/questdb-enterprise
cd tmp/questdb-enterprise || exit 1
git submodule init
git submodule update
cd ../..

# Build server
mvn clean package -e -f tmp/questdb-enterprise/pom.xml -DskipTests -P build-ent-binaries 2>&1

# Create dbroot
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
yarn workspace browser-tests test:enterprise
kill -SIGTERM $PID2

# Stop proxy
kill -SIGTERM $PID1
