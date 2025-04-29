import React, { useContext, useEffect, useState, useCallback } from "react"
import styled from "styled-components"
import { QuestContext, useAuth, useSettings } from "../../providers"
import { Box, Button } from "@questdb/react-components"
import * as QuestDB from "../../utils/questdb"
import { User as UserIcon, LogoutCircle, Edit } from "@styled-icons/remix-line"
import { InfoCircle } from "@styled-icons/boxicons-regular"
import { Text } from "../Text"
import { selectors } from "../../store"
import { useSelector } from "react-redux"
import { IconWithTooltip } from "../IconWithTooltip"
import { hasUIAuth } from "../../modules/OAuth2/utils"
import { InstanceSettingsPopper } from "./InstanceSettingsPopper"
import { Config } from "../../utils/questdb/types"

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

const Badge = styled(Box)<{ instance_rgb: ServerDetails["instance_rgb"], instance_name: ServerDetails["instance_name"] }>`
  background: ${({ theme }) => theme.color.backgroundLighter};
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem;
  height: 3rem;
  border-radius: 0.4rem;

  .instance-name {
    font-size: 1.6rem;
    color: ${({ theme }) => theme.color.gray2};
    flex: 1;
    display: inline-flex;
    line-height: 1.6rem;
    align-items: center;
  }

  .edit-icon {
    cursor: pointer;
    display: none;
    color: inherit;
    padding: 0.1rem;
    background: inherit;
    border-radius: 0.4rem;

    &:hover {
      color: ${({ theme }) => theme.color.backgroundLighter};
      background: ${({ theme }) => theme.color.gray2};
    }
  }

  &:hover {
    .edit-icon {
      display: inline;
      width: 2.2rem;
    }
  }

  ${({ theme, instance_rgb }) =>
    instance_rgb === "r" &&
    `
    background: #c7072d;

    .instance-name {
      color: ${theme.color.foreground};
    }

    .edit-icon:hover {
      background: ${theme.color.foreground};
      color: #c7072d;
    }
  `}

  ${({ theme, instance_rgb }) =>
    instance_rgb === "g" &&
    `
    background: #00aa3b;

    .instance-name {
      color: ${theme.color.foreground};
    }

    .edit-icon:hover {
      background: ${theme.color.foreground};
      color: #00aa3b;
    }
  `}

  ${({ theme, instance_rgb }) =>
    instance_rgb === "b" &&
    `
    background: #007aff;

    .instance-name {
      color: ${theme.color.foreground};
    }

    .edit-icon:hover {
      background: ${theme.color.foreground};
      color: #007aff;
    }
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
  const { settings } = useSettings()
  const { logout } = useAuth()
  const result = useSelector(selectors.query.getResult)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [settingsPopperActive, setSettingsPopperActive] = useState(false)
  const [configValues, setConfigValues] = useState<Config | null>(null)
  const [previewValues, setPreviewValues] = useState<Config | null>(null)

  const fetchServerDetails = async () => {
    try {
      const response = await quest.query<ServerDetails>(
        "SELECT current_user",
        {
          limit: "0,1",
        },
      )
      if (response.type === QuestDB.Type.DQL && response.count === 1) {
        setCurrentUser(response.data[0].current_user)
      }
    } catch (e) {
      return
    }
  }

  const fetchConfig = async () => {
    const config = await quest.getConfig()
    setConfigValues(config)
  }

  useEffect(() => {
    fetchServerDetails()
    fetchConfig()
  }, [])

  useEffect(() => {
    if (result && result.type === QuestDB.Type.DDL) {
      fetchServerDetails()
      fetchConfig()
    }
  }, [result])

  const handleSaveSettings = async (values: Config) => {
    try {
      const config = await quest.saveConfig(values)
      setConfigValues(config)
    } catch (e) {
      // Handle error
      fetchConfig()
    }
  }

  const handleToggle = useCallback((active: boolean) => {
    setSettingsPopperActive(active)
    setPreviewValues(active ? configValues : null)
  }, [configValues])

  return (
    <Root>
      <Box gap="0.5rem">
        <Text color="foreground">Web Console</Text>
        {settings["release.type"] === "EE" && (
          <IconWithTooltip
            icon={<EnterpriseBadge>EE</EnterpriseBadge>}
            tooltip="QuestDB Enterprise Edition"
            placement="bottom"
          />
        )}
      </Box>
      <Box gap="0.5rem">
        {configValues && (
          <Badge
            instance_rgb={previewValues?.instance_rgb ?? configValues?.instance_rgb ?? null}
            instance_name={previewValues?.instance_name ?? configValues?.instance_name ?? null}
          >
            {(previewValues?.instance_description || configValues?.instance_description) ? (
              <IconWithTooltip
                icon={<InfoCircle size="18px" />}
                tooltip={previewValues?.instance_description ?? configValues?.instance_description}
                placement="bottom"
              />
            ) : (
              <InfoCircle size="18px" />
            )}
            <Text className="instance-name">{previewValues?.instance_name ?? configValues?.instance_name ?? "Unnamed instance"}</Text>
            <Edit size="18px" className="edit-icon" onClick={() => handleToggle(true)} />
            <InstanceSettingsPopper
              active={settingsPopperActive}
              onToggle={handleToggle}
              values={previewValues ?? configValues}
              onSave={handleSaveSettings}
              onValuesChange={setPreviewValues}
            />
          </Badge>
        )}
        {settings["acl.enabled"] && currentUser && (
          <User>
            <UserIcon size="18px" />
            <Text color="foreground">{currentUser}</Text>
          </User>
        )}
        {hasUIAuth(settings) && (
          <Button
            onClick={() => logout()}
            prefixIcon={<LogoutCircle size="18px" />}
            skin="secondary"
            data-hook="button-logout"
          >
            Log out
          </Button>
        )}
      </Box>
    </Root>
  )
}
