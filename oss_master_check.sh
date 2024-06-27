#!/bin/bash

cd packages/browser-tests/questdb || exit 2
BRANCH=`git symbolic-ref --short HEAD`

if [[ $BRANCH = "master" ]]
then
  exit 0
else
  exit 1
fi
