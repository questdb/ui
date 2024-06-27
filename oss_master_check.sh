#!/bin/bash

cd packages/browser-tests/questdb || exit 2
BRANCH=`git rev-parse --abbrev-ref HEAD`
echo Branch name: $BRANCH

if [[ $BRANCH = "master" ]]
then
  exit 0
else
  exit 1
fi
