import React, { useContext, useEffect, useState } from "react"
import styled, { css } from "styled-components"
import { QuestContext } from "../../providers"
import { Box } from "@questdb/react-components"
import * as QuestDB from "../../utils/questdb"
import { Text } from "../Text"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"

enum Environment {
  DEV = "dev",
  PROD = "prod",
  TEST = "test",
  STAGING = "staging",
  CLOUD = "cloud",
}

type ServerDetails = {
  domain: string
  environment: Environment
}

const Root = styled(Box).attrs({ align: "center" })`
  gap: 1.5rem;
  flex-shrink: 0;
  margin-left: 0.5rem;
`

const Tag = styled(Box).attrs({ align: "center" })`
  height: 2.8rem;
  border-radius: 0.8rem;
  padding: 0 1rem;
  font-family: ${({ theme }) => theme.fontMonospace};
`

const Details = styled(Tag)`
  color: ${({ theme }) => theme.color.foreground};
  background: #2d303e;
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 600;
`

const Badge = styled(Tag)<{ environment: Environment }>`
  color: ${({ theme }) => theme.color.foreground};

  ${({ environment, theme }) =>
    environment === Environment.PROD &&
    `
    background: #c7072d;
  `}

  ${({ environment, theme }) =>
    [Environment.DEV, Environment.TEST, Environment.STAGING].includes(
      environment,
    ) &&
    `
    background: #9c5507;
  `}

  ${({ environment, theme }) =>
    environment === Environment.CLOUD &&
    `
    background: #2d303e;
  `}
`

const envStatusMap = {
  [Environment.PROD]: BadgeType.ERROR,
  [Environment.DEV]: BadgeType.WARNING,
  [Environment.TEST]: BadgeType.WARNING,
  [Environment.STAGING]: BadgeType.WARNING,
  [Environment.CLOUD]: BadgeType.INFO,
}

export const Version = () => {
  const { quest } = useContext(QuestContext)
  const [serverDetails, setServerDetails] = useState<ServerDetails | null>(null)

  const fetchServerDetails = async () => {
    const response = await quest.queryRaw("select build", {
      limit: "0,1",
    })
    if (response.type === QuestDB.Type.DQL && response.count === 1) {
      setServerDetails({
        // TODO: uncomment when the SQL is ready
        // domain: response.dataset[0][0] as string,
        // environment: response.dataset[0][1] as string,
        domain: location.hostname,
        environment: Environment.PROD,
      })
    }
  }

  useEffect(() => {
    void fetchServerDetails()
  }, [])

  return (
    <Root>
      <Text color="foreground">Web Console</Text>
      {serverDetails && (
        <Box gap="0.5rem">
          <Details>{serverDetails.domain}</Details>
          <Badge environment={serverDetails.environment}>
            {serverDetails.environment}
          </Badge>
        </Box>
      )}
    </Root>
  )
}
