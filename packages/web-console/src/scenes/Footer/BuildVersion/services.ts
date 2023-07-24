/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import { compare } from "compare-versions"

const buildVersionRegex =
  /Build Information: QuestDB ([\w- ]+ )?([0-9A-Za-z.-]*),/

export type Versions = {
  kind:
    | "dev"
    | "open-source"
    | "enterprise"
    | "enterprise pro"
    | "enterprise ultimate"
  version: string
}

export const formatVersion = (value: string): Versions => {
  const matches = buildVersionRegex.exec(value.toString())

  if (matches) {
    const kind = (
      matches[1] ? matches[1].trim().toLowerCase() : "open-source"
    ) as Versions["kind"]

    return {
      kind,
      version: matches[2],
    }
  }

  return {
    kind: "dev",
    version: "0.0.0",
  }
}

const commitHashRegex = /Commit Hash ([0-9A-Za-z]*)/

export const formatCommitHash = (value: string | number | boolean) => {
  const matches = commitHashRegex.exec(value.toString())

  return matches ? matches[1] : ""
}

export const getCanUpgrade = (
  buildVersion: Versions,
  newestReleaseTag?: string,
): boolean => {
  if (typeof newestReleaseTag === "undefined") {
    return false
  }

  const enterpriseVersion = buildVersion.kind.includes("enterprise")

  try {
    const isOlder = compare(buildVersion.version, newestReleaseTag, "<")
    return !enterpriseVersion && isOlder
  } catch (e) {
    return false
  }
}
