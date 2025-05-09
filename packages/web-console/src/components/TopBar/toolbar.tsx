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
import { hasUIAuth, setSSOUserNameWithClientID } from "../../modules/OAuth2/utils"
import { getValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { InstanceSettingsPopper } from "./InstanceSettingsPopper"
import { Preferences } from "../../utils/questdb/types"
import { PopperHover, Placement } from "../"
import { useTheme } from "styled-components"

const getTextColor = (backgroundColor: string | null, theme?: any): string => {
  if (!backgroundColor || !backgroundColor.startsWith('rgb')) {
    return theme?.color.foreground || "inherit";
  }
  
  const matches = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (matches) {
    const r = parseInt(matches[1], 10) / 255
    const g = parseInt(matches[2], 10) / 255
    const b = parseInt(matches[3], 10) / 255
    
    // Convert RGB to sRGB for better perceptual accuracy
    const R = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
    const G = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
    const B = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)
    
    // Calculate relative luminance using WCAG formula
    const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B

    if (luminance < 0.25) {
      return theme?.color.foreground;
    } else if (luminance < 0.50) {
      return theme?.color.gray2;
    } else if (luminance < 0.75) {
      return theme?.color.gray1; 
    } else {
      return theme?.color.background;
    }
  }
  return theme?.color.foreground || "inherit";
}

const Root = styled(Box).attrs({ align: "center" })`
  gap: 1.5rem;
  padding-left: 1.5rem;
  white-space: nowrap;
  display: flex;
  overflow: hidden;
`

const CustomTooltipWrapper = styled.div<{ instance_rgb?: string | null }>`
  position: relative;
  max-width: 460px;
  padding: 0.4rem;
  transform: translateY(-1rem);
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 4px;
  
  ${({ instance_rgb, theme }) =>
    instance_rgb === "r" &&
    `
    background: rgba(199, 7, 45, 0.95);
    border-color: #c7072d;
    color: ${getTextColor("r", theme)};
  `}

  ${({ instance_rgb, theme }) =>
    instance_rgb === "g" &&
    `
    background: rgba(0, 170, 59, 0.95);
    border-color: #00aa3b;
    color: ${getTextColor("g", theme)};
  `}

  ${({ instance_rgb, theme }) =>
    instance_rgb === "b" &&
    `
    background: rgba(0, 122, 255, 0.95);
    border-color: #007aff;
    color: ${getTextColor("b", theme)};
  `}
  
  ${({ instance_rgb, theme }) =>
    instance_rgb?.startsWith('rgb') &&
    `
    background: ${instance_rgb.replace('rgb', 'rgba').replace(')', ', 0.95)')};
    border-color: ${instance_rgb};
    color: ${getTextColor(instance_rgb, theme)};
  `}
`

const CustomTooltipText = styled.div<{ instance_rgb?: string | null }>`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme, instance_rgb }) => instance_rgb ? getTextColor(instance_rgb, theme) : theme.color.foreground};
`

const CustomTooltip = ({ 
  children, 
  instance_rgb
}: { 
  children: React.ReactNode, 
  instance_rgb?: string | null
}) => (
  <CustomTooltipWrapper instance_rgb={instance_rgb} data-hook="tooltip">
    <CustomTooltipText instance_rgb={instance_rgb}>{children}</CustomTooltipText>
  </CustomTooltipWrapper>
)

const CustomIconWithTooltip = ({ 
  icon, 
  tooltip, 
  placement, 
  instance_rgb
}: { 
  icon: React.ReactNode, 
  tooltip: React.ReactNode, 
  placement: Placement,
  instance_rgb?: string | null
}) => (
  <PopperHover 
    placement={placement} 
    trigger={icon} 
    modifiers={[
      {
        name: "offset",
        options: { offset: [0, 12] },
      }
    ]}
  >
    <CustomTooltip instance_rgb={instance_rgb}>
      {tooltip}
    </CustomTooltip>
  </PopperHover>
)

const Badge = styled(Box)<{ instance_rgb: Preferences["instance_rgb"] | null, $textColor: string }>`
  background: ${({ theme }) => theme.color.backgroundLighter};
  display: flex;
  align-items: center;
  padding: 0 1rem;
  padding-left: 0.3rem;
  height: 3rem;
  border-radius: 0.4rem;
  flex-shrink: 1;
  min-width: 0;
  gap: 0;

  .instance-name {
    font-size: 1.6rem;
    color: ${({ theme }) => theme.color.gray2};
    display: inline;
    vertical-align: middle;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    flex-shrink: 1;
    min-width: 0;
    margin-left: 0.3rem;
  }

  .edit-icon {
    cursor: pointer;
    display: inline;
    width: 0;
    color: $;
    padding: 0.1rem;
    background: inherit;
    border-radius: 0.4rem;
    flex-shrink: 0;

    &:hover {
      color: ${({ theme }) => theme.color.backgroundLighter};
      background: ${({ theme }) => theme.color.gray2};
    }
  }

  &:hover {
    .edit-icon {
      width: 2.2rem;
      margin-left: 1rem;
    }
  }

  ${({ instance_rgb, $textColor }) => instance_rgb && `
    .instance-name {
      color: ${$textColor};
    }

    .edit-icon {
      color: ${$textColor};
    }

    .edit-icon:hover {
      background: ${$textColor};
    }
  `}

  ${({ $textColor, instance_rgb }) =>
    instance_rgb === "r" &&
    `
    background: #c7072d;

    .edit-icon:hover {
      color: #c7072d;
    }
  `}

  ${({ $textColor, instance_rgb }) =>
    instance_rgb === "g" &&
    `
    background: #00aa3b;

    .edit-icon:hover {
      color: #00aa3b;
    }
  `}

  ${({ $textColor, instance_rgb }) =>
    instance_rgb === "b" &&
    `
    background: #007aff;

    .edit-icon:hover {
      color: #007aff;
    }
  `}
  
  ${({ theme, instance_rgb }) =>
    instance_rgb?.startsWith('rgb') &&
    `
    background: ${instance_rgb};

    .edit-icon:hover {
      color: ${instance_rgb};
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
  const [preferencesValues, setPreferencesValues] = useState<Preferences | null>(null)
  const [previewValues, setPreviewValues] = useState<Preferences | null>(null)
  const shownValues = settingsPopperActive ? previewValues : preferencesValues
  const theme = useTheme()
  const textColor = getTextColor(shownValues?.instance_rgb ?? null, theme)

  const fetchServerDetails = async () => {
    try {
      const response = await quest.query<{ current_user: string }>(
        "SELECT current_user",
        {
          limit: "0,1",
        },
      )
      if (response.type === QuestDB.Type.DQL && response.count === 1) {
        const currentUser = response.data[0].current_user
        setCurrentUser(currentUser)

        // an SSO user is logged in, update the SSO username
        const authPayload = getValue(StoreKey.AUTH_PAYLOAD)
        if (authPayload && currentUser && settings["acl.oidc.client.id"]) {
          setSSOUserNameWithClientID(settings["acl.oidc.client.id"], currentUser)
        }
      }
    } catch (e) {
      return
    }
  }

  const fetchPreferences = async () => {
    const preferences = await quest.getPreferences()
    setPreferencesValues(preferences)
  }

  useEffect(() => {
    fetchServerDetails()
    fetchPreferences()
  }, [])

  useEffect(() => {
    if (result && result.type === QuestDB.Type.DDL) {
      fetchServerDetails()
      fetchPreferences()
    }
  }, [result])

  const handleSaveSettings = async (values: Preferences) => {
    try {
      await quest.savePreferences(values, "overwrite")
    } catch (e) {
      // Handle error
    }
    await fetchPreferences()
  }

  const handleToggle = useCallback((active: boolean) => {
    setSettingsPopperActive(active)
    setPreviewValues(active ? preferencesValues : null)
  }, [preferencesValues])

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
      {preferencesValues && (
        <Badge
          $textColor={textColor}
          instance_rgb={shownValues?.instance_rgb ?? null}
          data-hook="topbar-instance-badge"
        >
          <Box data-hook="topbar-instance-info">
            {(shownValues?.instance_description) ? (
              <CustomIconWithTooltip
                icon={<div style={{ color: textColor, padding: '0.7rem' }}><InfoCircle size="18px" /></div>}
                tooltip={shownValues?.instance_description}
                placement="bottom"
                instance_rgb={shownValues?.instance_rgb}
              />
            ) : (
              <div style={{ color: textColor, padding: '0.7rem' }}>
                <InfoCircle size="18px" color={textColor} />
              </div>
            )}
          </Box>
          <Text data-hook="topbar-instance-name" className="instance-name">{shownValues?.instance_name ?? "Unnamed instance"}</Text>
          <InstanceSettingsPopper
            active={settingsPopperActive}
            onToggle={handleToggle}
            values={previewValues ?? preferencesValues}
            onSave={handleSaveSettings}
            onValuesChange={setPreviewValues}
            trigger={<Edit data-hook="topbar-instance-edit-icon" size="18px" className="edit-icon" />}
          />
        </Badge>
      )}
      <Box gap="0.5rem">
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
            Logout
          </Button>
        )}
      </Box>
    </Root>
  )
}
