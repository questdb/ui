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

import { QuestContext } from "../../../providers"
import React, { useContext, useEffect, useState } from "react"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import { SecondaryButton } from "../../../components"
import { formatCommitHash, formatVersion, Versions } from "./services"
import { ExternalLink, ArrowUpCircle } from "styled-icons/remix-line"
import { Release } from "../../../utils/questdb"
import { compare } from "compare-versions"
import { Team } from "styled-icons/remix-line"
import { BuildingMultiple } from "styled-icons/fluentui-system-filled"
import { ShieldLockFill } from "styled-icons/bootstrap"

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;

  & > :not(:last-child) {
    margin-right: 1rem;
  }
`
const ReleaseNotesButton = styled(SecondaryButton)<{ enterprise?: boolean }>`
  position: relative;
  ${({ enterprise }) => (enterprise ? `background: #322733;` : ``)}
  gap: 0.5rem;
`

const UpgradeIcon = styled(ArrowUpCircle)`
  color: ${({ theme }) => theme.color.green};
`

const NewestRelease = styled.span`
  color: ${({ theme }) => theme.color.green};
  font-size: ${({ theme }) => theme.fontSize.xs};
`

const versionButtons: {
  [key in Versions["kind"]]: { label: string; icon?: React.ReactNode }
} = {
  dev: {
    label: "QuestDB Dev",
  },
  "open-source": {
    label: "QuestDB",
  },
  enterprise: {
    icon: <Team size="18px" />,
    label: "QuestDB Enterprise",
  },
  "enterprise pro": {
    icon: <BuildingMultiple size="18px" />,
    label: "QuestDB Enterprise Pro",
  },
  "enterprise ultimate": {
    icon: <ShieldLockFill size="18px" />,
    label: "QuestDB Enterprise Ultimate",
  },
}

const BuildVersion = () => {
  const { quest } = useContext(QuestContext)
  const [buildVersion, setBuildVersion] = useState<Versions>({
    kind: "open-source",
    version: "",
  })
  const [commitHash, setCommitHash] = useState("")
  const [newestRelease, setNewestRelease] = useState<Release | null>(null)

  useEffect(() => {
    void quest.queryRaw("select build", { limit: "0,1000" }).then((result) => {
      if (result.type === QuestDB.Type.DQL && result.count === 1) {
        setBuildVersion(formatVersion(result.dataset[0][0] as string))
        setCommitHash(formatCommitHash(result.dataset[0][0]))
      }
    })
  }, [])

  useEffect(() => {
    if (buildVersion) {
      void quest.getLatestRelease().then((release: Release) => {
        if (release.name) {
          setNewestRelease(release)
        }
      })
    }
  }, [buildVersion])

  if (buildVersion.version === "" && !commitHash.length) {
    return null
  }

  const enterpriseVersion = buildVersion.kind.includes("enterprise")

  const upgradeAvailable =
    !enterpriseVersion &&
    newestRelease &&
    compare(buildVersion.version, newestRelease.name, "<")

  const releaseUrl = upgradeAvailable
    ? newestRelease.html_url
    : `https://github.com/questdb/questdb${
        buildVersion
          ? `/releases/tag/${buildVersion.version}`
          : `/commit/${commitHash}`
      }`

  const { label, icon } = versionButtons[buildVersion.kind]

  return (
    <Wrapper>
      <a
        href={enterpriseVersion ? "https://questdb.io/enterprise" : releaseUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <ReleaseNotesButton
          enterprise={enterpriseVersion}
          title={
            ["dev", "open-source"].includes(buildVersion.kind)
              ? `Show ${buildVersion ? "release notes" : "commit details"}`
              : ""
          }
        >
          {icon}
          {`${label} ${buildVersion.version}`}

          {!enterpriseVersion && <ExternalLink size="16px" />}
          {upgradeAvailable && (
            <>
              <UpgradeIcon size="18px" />
              <NewestRelease>{newestRelease.name}</NewestRelease>
            </>
          )}
        </ReleaseNotesButton>
      </a>
    </Wrapper>
  )
}

export default BuildVersion
