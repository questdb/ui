import React, { useContext, useEffect, useState, useCallback } from "react"
import styled from "styled-components"
import { QuestContext, useAuth, useSettings } from "../../providers"
import { Box, Button } from "@questdb/react-components"
import * as QuestDB from "../../utils/questdb"
import { User as UserIcon, LogoutCircle, Edit } from "@styled-icons/remix-line"
import { InfoCircle, Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { Tools, ShieldCheck } from "@styled-icons/bootstrap"
import { Flask } from "@styled-icons/boxicons-solid"
import { toast } from '../'
import { Text } from "../Text"
import { selectors } from "../../store"
import { useSelector } from "react-redux"
import { IconWithTooltip } from "../IconWithTooltip"
import { hasUIAuth, setSSOUserNameWithClientID } from "../../modules/OAuth2/utils"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { InstanceSettingsPopper } from "./InstanceSettingsPopper"
import { ClaudeApiSettings } from "../ClaudeApiSettings"
import { Preferences, InstanceType } from "../../utils"
import { PopperHover, Placement } from "../"
import { useTheme } from "styled-components"
import { TelemetryTable } from "../../consts"
import { TelemetryConfigShape } from "../../store/Telemetry/types"
import { sendServerInfoTelemetry } from "../../utils/telemetry"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"

const EnvIconWrapper = styled.div<{ $background?: string }>`
  display: flex;
  align-items: center;
  padding: 0.3rem;
  background: ${({ $background }) => $background ?? 'inherit'};
  border-radius: 0.4rem;
`

const Root = styled(Box).attrs({ align: "center" })`
  gap: 1.5rem;
  padding-left: 1.5rem;
  white-space: nowrap;
  display: flex;
  overflow: hidden;
`

const CustomTooltipWrapper = styled.div<{ $badgeColors: { primary: string, secondary: string } }>`
  display: flex;
  flex-direction: column;
  padding: 1.5rem 0;
  background: ${({ theme }) => theme.color.background};
  font-size: 1.4rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ $badgeColors }) => $badgeColors.primary};
  box-shadow: ${({ theme }) => theme.color.background} 5px 5px 8px;
`

const FlexRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`

const Title = styled.h4`
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.color.gray1};
  padding: 0 1.5rem 1.5rem;
  gap: 0.8rem;
  font-size: 1.4rem;
  margin-bottom: 0;
`

const FlexCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`

const Info = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 1.5rem;
  gap: 1rem;
`

const Badge = styled(Box)<{ $badgeColors: { primary: string, secondary: string } }>`
  display: flex;
  align-items: center;
  padding: 0 1rem;
  padding-left: 0.3rem;
  height: 3rem;
  border-radius: 0.4rem;
  flex-shrink: 1;
  min-width: 0;
  gap: 0;
  transition: opacity 0.1s ease;

  ${({ $badgeColors }) => `
    background: ${$badgeColors.primary};

    .instance-name {
      color: ${$badgeColors.secondary};
    }

    .edit-icon {
      color: ${$badgeColors.secondary};

      &:hover {
        color: ${$badgeColors.primary};
        background: ${$badgeColors.secondary};
      }
    }
  `}

  .instance-name {
    font-size: 1.6rem;
    display: inline-flex;
    gap: 0;
    align-items: center;
    vertical-align: middle;
    overflow: hidden;
    flex-shrink: 1;
    margin-left: 0.3rem;

    &-text {
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      flex-shrink: 1;
      min-width: 0;
      color: inherit;
    }

    &-type {
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      flex-shrink: 0;
      color: inherit;
    }

    &.placeholder {
      color: ${({ theme }) => theme.color.orange};
    }
  }

  .edit-icon {
    cursor: pointer;
    display: inline;
    width: 2.2rem;
    margin-left: 1rem;
    padding: 0.1rem;
    background: inherit;
    border-radius: 0.4rem;
    flex-shrink: 0;
    user-select: none;

    &.placeholder {
      color: ${({ theme }) => theme.color.orange};

      &:hover {
        color: ${({ theme }) => theme.color.backgroundLighter};
        background: ${({ theme }) => theme.color.orange};
      }
    }
  }
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

const Separator = styled.span<{ $color: string }>`
  display: inline-block;
  flex-shrink: 0;
  width: 0.15rem;
  margin: 0 1rem;
  height: 1.8rem;
  background: ${({ $color }) => $color};

`

const getSecondaryBadgeColor = (primaryColor: string | null, theme?: any): string => {
  if (!primaryColor || !primaryColor.startsWith('rgb')) {
    return theme?.color.foreground || "inherit";
  }

  const matches = primaryColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
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

const useBadgeColors = (instance_rgb: string | null) => {
  const theme = useTheme()
  if (!instance_rgb) {
    return {
      primary: theme.color.backgroundLighter,
      secondary: theme.color.foreground,
    }
  }

  if (instance_rgb.startsWith('rgb')) {
    return {
      primary: instance_rgb,
      secondary: getSecondaryBadgeColor(instance_rgb, theme),
    }
  }

  if (instance_rgb === 'r') {
    return {
      primary: 'rgb(199, 7, 45)',
      secondary: theme.color.foreground,
    }
  }

  if (instance_rgb === 'g') {
    return {
      primary: 'rgb(0, 170, 59)',
      secondary: theme.color.foreground,
    }
  }

  if (instance_rgb === 'b') {
    return {
      primary: 'rgb(0, 122, 255)',
      secondary: theme.color.foreground,
    }
  }

  return {
    primary: theme.color.backgroundLighter,
    secondary: theme.color.foreground,
  }
}

const EnvironmentIcon = ({ instanceType, color, style }: { instanceType: InstanceType | undefined, color?: string, style?: React.CSSProperties }) => {
  switch (instanceType) {
    case "development":
      return <Tools size="18px" color={color} style={{ ...style }} />
    case "production":
      return <ShieldCheck size="18px" color={color} style={{ ...style }} />
    case "testing":
      return <Flask size="18px" color={color} style={{ transform: 'scale(1.2)', ...style }} />
    default:
      return <InfoCircle size="18px" style={{ transform: 'translateY(-0.2rem)', ...style }} color={color} />
  }
};

const CustomIconWithTooltip = ({ 
  icon, 
  placement, 
  shownValues,
}: { 
  icon: React.ReactNode, 
  placement: Placement,
  shownValues: Preferences | null,
}) => {
  const badgeColors = useBadgeColors(shownValues?.instance_rgb ?? null)

  return (
    <PopperHover 
      placement={placement} 
      trigger={icon} 
    >
      <CustomTooltipWrapper $badgeColors={badgeColors}>
        <FlexCol>
          {shownValues?.instance_type && (
            <Title>
              <EnvIconWrapper $background={badgeColors.primary}>
                <EnvironmentIcon color={badgeColors.secondary} instanceType={shownValues?.instance_type} />
              </EnvIconWrapper>
              <Text color="foreground" weight={400}>You are connected to a QuestDB instance for {shownValues?.instance_type}</Text>
            </Title>
          )}
          <Info>
            <FlexRow>
              <Text color="foreground" weight={600}>Instance Name:</Text>
              <Text color="foreground" size="md">{shownValues?.instance_name}</Text>
            </FlexRow>
            {shownValues?.instance_description && (
              <FlexRow>
                <Text color="foreground" weight={600}>Description:</Text>
                <Text color="foreground" size="md">{shownValues?.instance_description}</Text>
              </FlexRow>
            )}
          </Info>
        </FlexCol>
      </CustomTooltipWrapper>
    </PopperHover>
  )
}

const animateBadgeUpdate = (badge: HTMLElement) => {
  badge.style.opacity = "0"
  setTimeout(() => {
    badge.style.opacity = "1"
  }, 200)
  setTimeout(() => {
    badge.style.opacity = "0"
  }, 400)
  setTimeout(() => {
    badge.style.opacity = "1"
  }, 600)
  setTimeout(() => {
    badge.style.opacity = "0"
  }, 800)
  setTimeout(() => {
    badge.style.opacity = "1"
  }, 1000)
}

export const Toolbar = () => {
  const { quest } = useContext(QuestContext)
  const { settings, preferences, refreshSettingsAndPreferences } = useSettings()
  const { logout } = useAuth()
  const result = useSelector(selectors.query.getResult)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [settingsPopperActive, setSettingsPopperActive] = useState(false)
  const [previewValues, setPreviewValues] = useState<Preferences | null>(null)
  const [canEditInstanceName, setCanEditInstanceName] = useState(false)
  const { autoRefreshTables } = useLocalStorage()
  const shownValues = settingsPopperActive ? previewValues : preferences
  const instanceTypeReadable = shownValues?.instance_type
    ? shownValues.instance_type.charAt(0).toUpperCase() + shownValues.instance_type.slice(1)
    : ''
  const badgeColors = useBadgeColors(shownValues?.instance_rgb ?? null)
  const theme = useTheme()

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

        const ssoAuthenticated = ssoAuthState.isSSOAuthenticated()
        if (ssoAuthenticated && currentUser && settings["acl.oidc.client.id"]) {
          // it is an SSO user, we should update the SSO username
          setSSOUserNameWithClientID(settings["acl.oidc.client.id"], currentUser)
        }
        return currentUser
      }
      return null
    } catch (e) {
      return null
    }
  }

  const fetchEditSettingsPermission = async (currentUser: string | null) => {
    const isReadonly = settings['http.settings.readonly'] === true
    if (settings['release.type'] === 'OSS') {
      setCanEditInstanceName(!isReadonly)
      return
    }

    if (!currentUser) {
      setCanEditInstanceName(false)
      return
    }

    try {
      const response = await quest.showPermissions(currentUser)
      // Admin user has no permissions listed
      const canEdit = response.type === QuestDB.Type.DQL
        && (response.count === 0 || response.data.some(d => d.permission === 'SETTINGS'))
      setCanEditInstanceName(canEdit)
    } catch (e) {
      setCanEditInstanceName(false)
    }
  }

  useEffect(() => {
    fetchServerDetails().then(fetchEditSettingsPermission)
    refreshSettingsAndPreferences()
  }, [])

  useEffect(() => {
    if (result && result.type === QuestDB.Type.DDL) {
      fetchServerDetails()
      refreshSettingsAndPreferences()
    }
  }, [result])

  const handleSaveSettings = async (values: Preferences) => {
    try {
      const result = await quest.savePreferences(values)
      if (result.success) {
        await handleToggle(false)
        toast.success("Instance information updated successfully.")

        const response = await quest.query<TelemetryConfigShape>(`${TelemetryTable.CONFIG} limit -1`)
        if (response.type === QuestDB.Type.DQL && response.count === 1) {
          const serverInfo = response.data[0] as TelemetryConfigShape
          sendServerInfoTelemetry(serverInfo)
        }
        return
      }

      const { preferences: newPreferences } = await refreshSettingsAndPreferences()
      setPreviewValues(newPreferences)
      if (result.status === 409) {
        toast.error("Instance information is updated with the latest changes from the server. Please try updating it again.", { autoClose: 5000 })
        return
      }

      throw new Error(result.message)
    } catch (e) {
      toast.error("Failed to update instance information: " + e, { autoClose: 5000 })
    }
  }

  const handleUpdateInstanceInfo = useCallback(async (inform: boolean = true) => {
    const currentVersion = preferences?.version
    const { preferences: newPreferences } = await refreshSettingsAndPreferences()
    if (currentVersion !== newPreferences.version && inform) {
      toast.info("Instance information is updated with the latest changes from the server.", { autoClose: 5000 })
      const badge = document.querySelector('[data-hook="topbar-instance-badge"]')
      if (badge) {
        animateBadgeUpdate(badge as HTMLElement)
      }
    }
    return newPreferences
  }, [refreshSettingsAndPreferences, preferences])

  const handleUpdateInstanceInfoWithInform = useCallback(async () => {
    const newPreferences = await handleUpdateInstanceInfo(true)
    if (settingsPopperActive && previewValues?.version !== newPreferences.version) {
      setPreviewValues(newPreferences)
    }
  }, [handleUpdateInstanceInfo, settingsPopperActive, previewValues])

  const handleToggle = useCallback(async (active: boolean) => {
    const newPreferences = await handleUpdateInstanceInfo(active)
    setPreviewValues(active ? newPreferences : null)
    setSettingsPopperActive(active)
  }, [handleUpdateInstanceInfo])

  useEffect(() => {
    if (autoRefreshTables) {
      window.addEventListener("focus", handleUpdateInstanceInfoWithInform)
    }

    return () => {
      window.removeEventListener("focus", handleUpdateInstanceInfoWithInform)
    }
  }, [handleUpdateInstanceInfoWithInform, autoRefreshTables])

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
      {preferences && (
        <Badge
          $badgeColors={badgeColors}
          data-hook="topbar-instance-badge"
        >
          <Box>
            {(shownValues?.instance_type) ? (
              <CustomIconWithTooltip
                icon={(
                  <div
                    data-hook="topbar-instance-icon"
                    style={{ padding: '0.7rem' }}
                  >
                    <EnvironmentIcon
                      instanceType={shownValues?.instance_type}
                      color={badgeColors.secondary}
                      style={shownValues?.instance_type === 'production' ? { transform: 'translateY(-0.1rem)' } : {}} 
                    />
                  </div>
                )}
                placement="bottom"
                shownValues={shownValues}
              />
            ) : (
              <div style={{ padding: '0.7rem' }}>
                <ErrorIcon size="18px" color={theme.color.orange} style={{ transform: 'scale(1.3) translateY(-0.1rem)' }} />
              </div>
            )}
          </Box>
          {shownValues?.instance_name
            ? <Box data-hook="topbar-instance-name" className="instance-name">
                <Text className="instance-name-type">{instanceTypeReadable}</Text>
                <Separator $color={badgeColors.secondary} />
                <Text className="instance-name-text">{shownValues?.instance_name}</Text>
              </Box>
            : <Text data-hook="topbar-instance-name" className="instance-name placeholder">Instance name is not set</Text>
          }
          {canEditInstanceName && (
            <InstanceSettingsPopper
              active={settingsPopperActive}
              onToggle={handleToggle}
              values={previewValues ?? preferences}
              onSave={handleSaveSettings}
              onValuesChange={setPreviewValues}
              trigger={<Edit data-hook="topbar-instance-edit-icon" size="18px" className={`edit-icon ${shownValues?.instance_name ? '' : 'placeholder'}`} />}
            />
          )}
        </Badge>
      )}
      <Box gap="0.5rem">
        <ClaudeApiSettings />
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
