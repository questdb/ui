import React, { useContext, useEffect, useState } from "react"
import styled from "styled-components"
import { QuestContext, useAuth } from "../../providers"
import { Box, Button } from "@questdb/react-components"
import * as QuestDB from "../../utils/questdb"
import { User as UserIcon, LogoutCircle } from "@styled-icons/remix-line"
import { Text } from "../Text"
import { selectors } from "../../store"
import { useSelector } from "react-redux"
import { IconWithTooltip } from "../IconWithTooltip"

type ServerDetails = {
  instance_name: string | null
  instance_rgb: string | null
  current_user: string | null
}

const Root = styled(Box).attrs({ align: "center" })`
  gap: 1.5rem;
  flex-shrink: 0;
  padding-left: 1.5rem;
  white-space: nowrap;
`

const Tag = styled(Box).attrs({ align: "center" })`
  height: 2.8rem;
  border-radius: 0.8rem;
  padding: 0 1rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.6rem;
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

const User = styled(Box).attrs({ gap: "0.5rem" })`
  background: ${({ theme }) => theme.color.backgroundLighter};
  border-radius: 0.4rem;
  height: 3rem;
  padding: 0 1rem;
  font-weight: 600;
`

const EnterpriseBadge = styled.span`
  padding: 0 4px;
  background: ${({ theme }) => theme.color.pinkDarker};
  border-radius: 2px;
  color: ${({ theme }) => theme.color.foreground};

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

export const Toolbar = () => {
  const { quest } = useContext(QuestContext)
  const settings = useSelector(selectors.console.getSettings)
  const { logout } = useAuth()
  const result = useSelector(selectors.query.getResult)
  const [serverDetails, setServerDetails] = useState<ServerDetails | null>(null)

  const basicAuthEnabled = settings["acl.basic.auth.realm.enabled"]

  const fetchServerDetails = async () => {
    try {
      const response = await quest.query<ServerDetails>(
        "SELECT instance_name, instance_rgb, current_user",
        {
          limit: "0,1",
        },
      )
      if (response.type === QuestDB.Type.DQL && response.count === 1) {
        setServerDetails({
          instance_name: response.data[0].instance_name,
          instance_rgb: response.data[0].instance_rgb,
          current_user: response.data[0].current_user,
        })
      }
    } catch (e) {
      return
    }
  }

  useEffect(() => {
    fetchServerDetails()
  }, [])

  useEffect(() => {
    if (result && result.type === QuestDB.Type.DDL) {
      fetchServerDetails()
    }
  }, [result])

  return (
    <Root>
      <Box gap="0.5rem">
        <Text color="foreground">Web Console</Text>
        <IconWithTooltip
          icon={<EnterpriseBadge>EE</EnterpriseBadge>}
          tooltip="QuestDB Enterprise Edition"
          placement="bottom"
        />
      </Box>
      <Box gap="0.5rem">
        {serverDetails && serverDetails.instance_name && (
          <Badge instance_rgb={serverDetails.instance_rgb}>
            {serverDetails.instance_name}
          </Badge>
        )}
        {serverDetails && serverDetails.current_user && (
          <User>
            <UserIcon size="18px" />
            <Text color="foreground">{serverDetails.current_user}</Text>
          </User>
        )}
        {!basicAuthEnabled && (
          <Button
            onClick={() => logout()}
            prefixIcon={<LogoutCircle size="18px" />}
            skin="secondary"
          >
            Log out
          </Button>
        )}
      </Box>
    </Root>
  )
}
