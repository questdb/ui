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
import { ExternalLink, ArrowUpCircle } from "../../../components/icons"
import { Release } from "../../../utils/questdb"
import { Team } from "../../../components/icons"
import { BuildingMultiple } from "../../../components/icons"
import { ShieldLockFill } from "../../../components/icons"
import { Versions } from "../../../providers/QuestProvider/types"
import { getCanUpgrade } from "./services"
import { Button } from "../../../components"

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;

  & > :not(:last-child) {
    margin-right: 1rem;
  }
`
const ReleaseNotesButton = styled(Button).attrs({
  forwardedAs: "a",
  variant: "tertiary",
})`
  position: relative;
  gap: 0.5rem;
  height: 3.2rem;
  padding: 0 1rem;
  border-radius: 0.6rem;
  font-size: 1.25rem;
  text-decoration: none;
`

const QuestDBLogo = styled.img`
  width: 1.5rem;
  height: auto;
`

const UpgradeIcon = styled(ArrowUpCircle)`
  color: ${({ theme }) => theme.color.statusSuccess};
`

const NewestRelease = styled.span`
  color: ${({ theme }) => theme.color.statusSuccess};
  font-size: ${({ theme }) => theme.fontSize.xs};
`

const versionButtons: {
  [key in Versions["type"]]: { label: string; icon?: React.ReactNode }
} = {
  dev: {
    icon: <QuestDBLogo src="assets/questdb.svg" alt="" />,
    label: "QuestDB Dev",
  },
  oss: {
    icon: <QuestDBLogo src="assets/questdb.svg" alt="" />,
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
  const { quest, buildVersion, commitHash } = useContext(QuestContext)
  const [newestRelease, setNewestRelease] = useState<Release | null>(null)

  useEffect(() => {
    if (buildVersion.version && buildVersion.type.includes("oss")) {
      void quest
        .getLatestRelease()
        .then((release: Release) => {
          if (release.name) {
            setNewestRelease(release)
          }
        })
        .catch((e) => {
          console.error(e)
        })
    }
  }, [buildVersion])

  if (buildVersion.version === "" && !commitHash.length) {
    return null
  }

  const enterpriseVersion = buildVersion.type.includes("enterprise")
  const upgradeAvailable = getCanUpgrade(buildVersion, newestRelease?.name)

  const releaseUrl = upgradeAvailable
    ? newestRelease?.html_url
    : `https://github.com/questdb/questdb${
        buildVersion
          ? `/releases/tag/${buildVersion.version}`
          : `/commit/${commitHash}`
      }`

  const { label, icon } =
    versionButtons[buildVersion.type] ??
    /* fallback to `dev` if `.kind` is something unexpected */
    versionButtons.dev

  return (
    <Wrapper>
      <ReleaseNotesButton
        href={enterpriseVersion ? "https://questdb.io/enterprise" : releaseUrl}
        rel="noopener noreferrer"
        target="_blank"
        title={
          ["dev", "oss"].includes(buildVersion.type)
            ? `Show ${buildVersion ? "release notes" : "commit details"}`
            : ""
        }
      >
        {icon}
        {label}
        {buildVersion.version ? ` ${buildVersion.version}` : ""}

        {!enterpriseVersion && <ExternalLink size="16px" />}
        {upgradeAvailable && (
          <>
            <UpgradeIcon size="18px" />
            <NewestRelease>{newestRelease?.name}</NewestRelease>
          </>
        )}
      </ReleaseNotesButton>
    </Wrapper>
  )
}

export default BuildVersion
