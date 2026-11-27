#!/usr/bin/env bash
# Local fixture; no dependencies, production build or service is run.
set -euo pipefail
TOOL=$(cd "$(dirname "$0")" && pwd)/review-build-cache.mjs
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export COUNTER="$TMP/count"
mkdir "$TMP/repo"
cd "$TMP/repo"
git init -q --template=
commit() {
  git -c user.name=Fixture -c user.email=fixture@example.test -c commit.gpgSign=false \
    -c core.hooksPath=/dev/null commit "$@"
}
printf 'dist\ncore/target/\n.env*\n' > .gitignore
printf 'one\n' > source.txt
git add .gitignore source.txt
commit -qm one
ONE=$(git rev-parse HEAD)
printf 'two\n' > source.txt
commit -qam two
TWO=$(git rev-parse HEAD)

git checkout -q --detach "$ONE"
ui() { local rev=$1 profile=$2; shift 2; node "$TOOL" "$TMP/cache" ui "$rev" "$profile" "$@"; }
jar() { local rev=$1 profile=$2; shift 2; node "$TOOL" "$TMP/cache" jar "$rev" "$profile" "$@"; }
producer() { ui "$1" "$2" -- bash -c 'echo ran >> "$COUNTER"; mkdir dist; cp source.txt dist/index.html; echo build-output'; }
expect_exit() {
  local want=$1 actual=0
  shift
  "$@" > "$TMP/out" 2> "$TMP/err" || actual=$?
  [[ $actual == "$want" && ! -s "$TMP/out" ]] || { cat "$TMP/out" "$TMP/err"; exit 1; }
}

DIST=$(producer "$ONE" standard 2> "$TMP/build.log")
grep -qx build-output "$TMP/build.log"
[[ $(producer "$ONE" standard) == "$DIST" ]]
[[ $(wc -l < "$COUNTER") -eq 1 ]]
# Both a preview copy and a producer reset leave an old cache path untouched.
rm -rf dist
ln -s "$DIST" dist
rm -rf -- dist && cp -R "$DIST" dist
printf 'scratch change\n' > dist/index.html
[[ $(cat "$DIST/index.html") == one ]]
rm -rf dist
ln -s "$DIST" dist
[[ $(producer "$ONE" other-profile) != "$DIST" ]]
[[ $(cat "$DIST/index.html") == one ]]
[[ $(VITE_FIXTURE=different producer "$ONE" standard) != "$DIST" ]]
git checkout -q --detach "$TWO"
DIST_TWO=$(producer "$TWO" standard)
[[ $DIST_TWO != "$DIST" && $(cat "$DIST_TWO/index.html") == two ]]
[[ $(wc -l < "$COUNTER") -eq 4 ]]
[[ $(ui "$ONE" standard) == "$DIST" ]]
expect_exit 1 node "$TOOL" "$TMP/other-cycle" ui "$ONE" standard

# Ignored Vite inputs must not consume a hit, start a producer, or publish.
printf 'VITE_FLAG=local\n' > .env
expect_exit 2 ui "$TWO" standard
expect_exit 2 producer "$TWO" local-env
[[ $(wc -l < "$COUNTER") -eq 4 ]]
rm .env
expect_exit 1 ui "$TWO" local-env
expect_exit 2 ui "$TWO" local-env -- bash -c \
  'mkdir dist; touch dist/index.html; echo VITE_FLAG=local > .env.production.local'
rm .env.production.local
expect_exit 1 ui "$TWO" local-env

expect_exit 42 ui "$TWO" failed -- bash -c 'mkdir dist; touch dist/index.html; echo fail; exit 42'
grep -qx fail "$TMP/err"
expect_exit 1 ui "$TWO" failed
expect_exit 2 ui "$TWO" incomplete -- true
expect_exit 1 ui "$TWO" incomplete
expect_exit 143 ui "$TWO" interrupted -- bash -c 'mkdir dist; touch dist/index.html; kill -TERM $$'
mkdir -p "$TMP/cache/ui/$TWO/.partial-leftover/dist"
touch "$TMP/cache/ui/$TWO/.partial-leftover/dist/index.html"
expect_exit 1 ui "$TWO" interrupted
printf 'dirty\n' > source.txt
expect_exit 2 producer "$TWO" dirty
[[ $(wc -l < "$COUNTER") -eq 4 ]]
git checkout -- source.txt
expect_exit 2 ui "$TWO" mutated -- bash -c 'mkdir dist; touch dist/index.html; echo changed >> source.txt'
expect_exit 1 ui "$TWO" mutated
git checkout -- source.txt

mkdir -p "$TMP/jar/META-INF" "$TMP/jar/io/questdb"
printf 'Manifest-Version: 1.0\r\nBuild-Commit-Hash: %s\r\n\r\n' "$ONE" > "$TMP/jar/META-INF/MANIFEST.MF"
touch "$TMP/jar/io/questdb/ServerMain.class"
(cd "$TMP/jar" && zip -q "$TMP/fixture.jar" META-INF/MANIFEST.MF io/questdb/ServerMain.class)
expect_exit 2 jar "$TWO" qdb-profile --reuse "$TMP/fixture.jar"
expect_exit 1 jar "$TWO" qdb-profile
JAR=$(jar "$ONE" qdb-profile --reuse "$TMP/fixture.jar")
[[ $(jar "$ONE" qdb-profile -- false) == "$JAR" ]]
expect_exit 1 jar "$ONE" other-qdb-profile
git checkout -q --detach "$ONE"
BUILT_JAR=$(jar "$ONE" other-qdb-profile -- bash -c 'mkdir -p core/target; cp "$1" core/target/questdb-1.0.jar' _ "$TMP/fixture.jar")
[[ $BUILT_JAR != "$JAR" && $(jar "$ONE" other-qdb-profile -- false) == "$BUILT_JAR" ]]
cmp "$JAR" "$BUILT_JAR"
echo 'review-build-cache fixture passed'
