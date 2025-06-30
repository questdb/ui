#!/bin/bash -x

# Run it from the 'ui' directory as:
# ./run_ent_browser_tests.sh

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

# Unpack server
tar xzf tmp/questdb-enterprise/questdb-ent/target/questdb-enterprise-*-rt-*.tar.gz -C tmp/
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

# Running enterprise tests
rm -rf tmp/dbroot/*
./tmp/questdb-*/bin/questdb.sh start -d tmp/dbroot
yarn workspace browser-tests test:enterprise
./tmp/questdb-*/bin/questdb.sh stop

# Stop proxy
kill -SIGTERM $PID1
