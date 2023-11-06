import React, { useContext, useEffect, useState } from "react"
import styled from "styled-components"
import { QuestContext } from "../../providers"
import { Box } from "@questdb/react-components"
import * as QuestDB from "../../utils/questdb"
import { Text } from "../Text"

type ServerDetails = {
  instance_name: string | null
  instance_rgb: string | null
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
  font-size: 1.5rem;
  font-weight: 600;
`

const Badge = styled(Tag)<{ instance_rgb: ServerDetails["instance_rgb"] }>`
  color: #191a21;
  background: #bbbbbb;

  ${({ theme, instance_rgb }) =>
    instance_rgb === "r" &&
    `
    color: ${theme.color.foreground};
    background: #c7072d;
  `}

  ${({ theme, instance_rgb }) =>
    instance_rgb === "g" &&
    `
    color: ${theme.color.foreground};
    background: #00aa3b;
  `}

  ${({ theme, instance_rgb }) =>
    instance_rgb === "b" &&
    `
    color: ${theme.color.foreground};
    background: #007aff;
  `}
`

export const Version = () => {
  const { quest } = useContext(QuestContext)
  const [serverDetails, setServerDetails] = useState<ServerDetails | null>(null)

  const fetchServerDetails = async () => {
    try {
      const response = await quest.queryRaw(
        "SELECT instance_name, instance_rgb",
        {
          limit: "0,1",
        },
      )
      if (response.type === QuestDB.Type.DQL && response.count === 1) {
        setServerDetails({
          instance_name: response.dataset[0][0] as string,
          instance_rgb: (response.dataset[0][1] as string).toLowerCase(),
        })
      }
    } catch (e) {
      return
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
          <Badge instance_rgb={serverDetails.instance_rgb}>
            {serverDetails.instance_name}
          </Badge>
        </Box>
      )}
    </Root>
  )
}
