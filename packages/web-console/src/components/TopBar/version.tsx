import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { QuestContext } from "../../providers"
import { useContext } from "react"
import { Badge, Box } from "@questdb/react-components"
import * as QuestDB from "../../utils/questdb"
import { Text } from "../../components"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"

enum Environment {
  DEV = "dev",
  PROD = "prod",
  TEST = "test",
  STAGING = "staging",
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

const Details = styled(Box).attrs({ align: "center" })`
  height: 2.8rem;
  border-radius: 0.8rem;
  padding: 0 1rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.color.foreground};
  background: #2d303e;
`

const envStatusMap = {
  [Environment.PROD]: BadgeType.SUCCESS,
  [Environment.DEV]: BadgeType.WARNING,
  [Environment.TEST]: BadgeType.WARNING,
  [Environment.STAGING]: BadgeType.WARNING,
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
    fetchServerDetails()
  }, [])

  return (
    <Root>
      <Text color="foreground">Web Console</Text>
      {serverDetails && (
        <Box gap="0.5rem">
          <Details>{serverDetails.domain}</Details>
          <Badge type={envStatusMap[serverDetails.environment]}>
            {serverDetails.environment}
          </Badge>
        </Box>
      )}
    </Root>
  )
}
