import React, { useContext, useEffect, useState, useCallback } from "react"
import styled from "styled-components"
import { QuestContext, useAuth, useSettings } from "../../providers"
import * as QuestDB from "../../utils/questdb"
import { User as UserIcon, LogoutCircle, Edit } from "../icons"
import { Error as ErrorIcon } from "../icons"
import { toast } from "../Toast"
import { Badge as StatusBadge, Box, Button } from "../../components"
import { Text } from "../Text"
import { selectors } from "../../store"
import { useSelector } from "react-redux"
import { IconWithTooltip } from "../IconWithTooltip"
import {
  hasUIAuth,
  setSSOUserNameWithClientID,
} from "../../modules/OAuth2/utils"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { InstanceSettingsPopper } from "./InstanceSettingsPopper"
import { pickReadableTextColor, Preferences } from "../../utils"
import { PopperHover, Placement } from "../"
import { useTheme } from "styled-components"
import { TelemetryTable } from "../../consts"
import { TelemetryConfigShape } from "../../store/Telemetry/types"
import { sendServerInfoTelemetry } from "../../utils/telemetry"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { InstanceTypeIcon } from "./InstanceTypeIcon"

const EnvIconWrapper = styled.div<{ $background?: string }>`
  display: flex;
  width: 4rem;
  height: 4rem;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${({ $background, theme }) =>
    $background ?? theme.color.surfaceRaised};
  border-radius: 0.6rem;
`

const Root = styled(Box).attrs({ align: "center" })`
  flex: 1 1 auto;
  min-width: 0;
  gap: 1rem;
  padding-left: 0;
  white-space: nowrap;
  display: flex;
  overflow: hidden;
`

const CustomTooltipWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 26rem;
  max-width: min(36rem, calc(100vw - 2rem));
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.8rem;
  box-shadow:
    0 1.4rem 3.4rem ${({ theme }) => theme.color.shadowMedium},
    0 0.3rem 0.8rem ${({ theme }) => theme.color.shadowSoft};
`

const TooltipHeader = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  padding: 1.4rem;
`

const TooltipIdentity = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.3rem;
`

const TooltipType = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
`

const TooltipName = styled.strong`
  overflow: hidden;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TooltipDescription = styled.p`
  margin: 0;
  padding: 1.2rem 1.4rem 1.4rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.3rem;
  line-height: 1.5;
  white-space: normal;
`

const Badge = styled(Box)<{
  $badgeColors: { primary: string; secondary: string }
}>`
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  padding: 0.4rem 0.8rem 0.4rem 0.4rem;
  height: 4rem;
  min-width: 0;
  gap: 0.5rem;
  border-radius: 4px;
  transition: opacity 0.1s ease;

  ${({ $badgeColors, theme }) => `
    background: ${$badgeColors.primary};

    .instance-name {
      color: ${$badgeColors.secondary};
    }

    && .edit-icon {
      color: ${$badgeColors.secondary};

      &:hover:not(:disabled):not([aria-disabled="true"]) {
        color: ${
          $badgeColors.primary === theme.color.transparent
            ? theme.color.surfaceBase
            : $badgeColors.primary
        };
        background: ${$badgeColors.secondary};
      }
    }
  `}

  .instance-name {
    display: flex;
    flex: 1 1 auto;
    max-width: 100%;
    flex-direction: column;
    gap: 0;
    align-items: flex-start;
    justify-content: center;
    vertical-align: middle;
    overflow: hidden;
    min-width: 0;
    margin-left: 0;
    line-height: 1.1;

    &-text {
      display: block;
      width: 100%;
      max-width: 100%;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      flex-shrink: 1;
      line-height: 1.2;
      min-width: 0;
      color: inherit;
      font-size: 1.4rem;
      font-weight: 600;
    }

    &-type {
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      flex-shrink: 0;
      color: inherit;
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.66;
    }

    &.placeholder {
      color: ${({ theme }) => theme.color.statusWarning};
    }
  }

  && .edit-icon {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    min-width: 2.8rem;
    height: 2.8rem;
    margin-left: 0.4rem;
    padding: 0;
    border: 0;
    background: transparent;
    border-radius: 0.4rem;
    flex-shrink: 0;
    user-select: none;

    &.placeholder {
      color: ${({ theme }) => theme.color.statusWarning};

      &:hover:not(:disabled):not([aria-disabled="true"]) {
        color: ${({ theme }) => theme.color.surfaceRaised};
        background: ${({ theme }) => theme.color.statusWarning};
      }
    }
  }
`

const InstanceIconSlot = styled(Box)`
  flex: 0 0 auto;
`

const AccountActions = styled(Box).attrs({ gap: "0.8rem" })`
  flex: 0 0 auto;
`

const User = styled(Box).attrs({ gap: "0.5rem" })`
  background: ${({ theme }) => theme.color.controlSurface};
  border-radius: 0.4rem;
  height: 3rem;
  padding: 0 1rem;
  font-weight: 600;
`
const EnterpriseBadge = styled(StatusBadge).attrs({
  variant: "accent",
  size: "sm",
})`
  height: 1.8rem;

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

const Separator = styled.span<{ $color: string }>`
  display: none;
  flex-shrink: 0;
  width: 0.15rem;
  margin: 0 1rem;
  height: 1.8rem;
  background: ${({ $color }) => $color};
`

const useBadgeColors = (instance_rgb: string | null) => {
  const theme = useTheme()

  // The badge fill is theme-invariant (a preset or a user-chosen color), so
  // its text must be picked against the fill itself rather than the theme.
  const badgeColors = (background: string) => ({
    primary: background,
    secondary: pickReadableTextColor(background, [
      theme.color.contentInverse,
      theme.color.neutralInk,
    ]),
  })

  if (instance_rgb?.startsWith("rgb")) {
    return badgeColors(instance_rgb)
  }

  if (instance_rgb === "r") {
    return badgeColors(theme.color.instancePreset1)
  }

  if (instance_rgb === "g") {
    return badgeColors(theme.color.instancePreset2)
  }

  if (instance_rgb === "b") {
    return badgeColors(theme.color.instancePreset3)
  }

  return {
    primary: theme.color.transparent,
    secondary: theme.color.contentPrimary,
  }
}

const CustomIconWithTooltip = ({
  icon,
  placement,
  shownValues,
}: {
  icon: React.ReactNode
  placement: Placement
  shownValues: Preferences | null
}) => {
  const badgeColors = useBadgeColors(shownValues?.instance_rgb ?? null)

  return (
    <PopperHover placement={placement} trigger={icon}>
      <CustomTooltipWrapper>
        <TooltipHeader>
          <EnvIconWrapper $background={badgeColors.primary}>
            <InstanceTypeIcon
              color={badgeColors.secondary}
              instanceType={shownValues?.instance_type}
              size={20}
            />
          </EnvIconWrapper>
          <TooltipIdentity>
            {shownValues?.instance_type && (
              <TooltipType>{shownValues.instance_type}</TooltipType>
            )}
            <TooltipName>
              {shownValues?.instance_name || "Unnamed instance"}
            </TooltipName>
          </TooltipIdentity>
        </TooltipHeader>
        {shownValues?.instance_description && (
          <TooltipDescription>
            {shownValues.instance_description}
          </TooltipDescription>
        )}
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
    ? shownValues.instance_type.charAt(0).toUpperCase() +
      shownValues.instance_type.slice(1)
    : ""
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
          setSSOUserNameWithClientID(
            settings["acl.oidc.client.id"],
            currentUser,
          )
        }
        return currentUser
      }
      return null
    } catch (e) {
      return null
    }
  }

  const fetchEditSettingsPermission = async (currentUser: string | null) => {
    const isReadonly = settings["http.settings.readonly"] === true
    if (settings["release.type"] === "OSS") {
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
      const canEdit =
        response.type === QuestDB.Type.DQL &&
        (response.count === 0 ||
          response.data.some((d) => d.permission === "SETTINGS"))
      setCanEditInstanceName(canEdit)
    } catch (e) {
      setCanEditInstanceName(false)
    }
  }

  useEffect(() => {
    void fetchServerDetails().then(fetchEditSettingsPermission)
    void refreshSettingsAndPreferences()
  }, [])

  useEffect(() => {
    if (result && result.type === QuestDB.Type.DDL) {
      void fetchServerDetails()
      void refreshSettingsAndPreferences()
    }
  }, [result])

  const handleSaveSettings = async (values: Preferences) => {
    try {
      const result = await quest.savePreferences(values)
      if (result.success) {
        await handleToggle(false)
        toast.success("Instance information updated successfully.")

        const response = await quest.query<TelemetryConfigShape>(
          `${TelemetryTable.CONFIG} limit -1`,
        )
        if (response.type === QuestDB.Type.DQL && response.count === 1) {
          const serverInfo = response.data[0]
          void sendServerInfoTelemetry(serverInfo)
        }
        return
      }

      const { preferences: newPreferences } =
        await refreshSettingsAndPreferences()
      setPreviewValues(newPreferences)
      if (result.status === 409) {
        toast.error(
          "Instance information is updated with the latest changes from the server. Please try updating it again.",
          { autoClose: 5000 },
        )
        return
      }

      throw new Error(result.message)
    } catch (e) {
      toast.error(`Failed to update instance information: ${e}`, {
        autoClose: 5000,
      })
    }
  }

  const handleUpdateInstanceInfo = useCallback(
    async (inform: boolean = true) => {
      const currentVersion = preferences?.version
      const { preferences: newPreferences } =
        await refreshSettingsAndPreferences()
      if (currentVersion !== newPreferences.version && inform) {
        toast.info(
          "Instance information is updated with the latest changes from the server.",
          { autoClose: 5000 },
        )
        const badge = document.querySelector(
          '[data-hook="topbar-instance-badge"]',
        )
        if (badge) {
          animateBadgeUpdate(badge as HTMLElement)
        }
      }
      return newPreferences
    },
    [refreshSettingsAndPreferences, preferences],
  )

  const handleUpdateInstanceInfoWithInform = useCallback(async () => {
    const newPreferences = await handleUpdateInstanceInfo(true)
    if (
      settingsPopperActive &&
      previewValues?.version !== newPreferences.version
    ) {
      setPreviewValues(newPreferences)
    }
  }, [handleUpdateInstanceInfo, settingsPopperActive, previewValues])

  const handleToggle = useCallback(
    async (active: boolean) => {
      const newPreferences = await handleUpdateInstanceInfo(active)
      setPreviewValues(active ? newPreferences : null)
      setSettingsPopperActive(active)
    },
    [handleUpdateInstanceInfo],
  )

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
      {settings["release.type"] === "EE" && (
        <IconWithTooltip
          icon={<EnterpriseBadge>EE</EnterpriseBadge>}
          tooltip="QuestDB Enterprise Edition"
          placement="bottom"
        />
      )}
      {preferences && (
        <Badge $badgeColors={badgeColors} data-hook="topbar-instance-badge">
          <InstanceIconSlot>
            {shownValues?.instance_type ? (
              <CustomIconWithTooltip
                icon={
                  <div
                    data-hook="topbar-instance-icon"
                    style={{ padding: "0.5rem 0.15rem", display: "flex" }}
                  >
                    <InstanceTypeIcon
                      instanceType={shownValues?.instance_type}
                      color={badgeColors.secondary}
                      size={24}
                    />
                  </div>
                }
                placement="bottom"
                shownValues={shownValues}
              />
            ) : (
              <div style={{ padding: "0.5rem 0.15rem", display: "flex" }}>
                <ErrorIcon
                  size="24px"
                  color={theme.color.statusWarning}
                  style={{ transform: "scale(1.15)" }}
                />
              </div>
            )}
          </InstanceIconSlot>
          {shownValues?.instance_name ? (
            <Box data-hook="topbar-instance-name" className="instance-name">
              <Text className="instance-name-type">{instanceTypeReadable}</Text>
              <Separator $color={badgeColors.secondary} />
              <Text className="instance-name-text">
                {shownValues?.instance_name}
              </Text>
            </Box>
          ) : (
            <Text
              data-hook="topbar-instance-name"
              className="instance-name placeholder"
            >
              Instance name is not set
            </Text>
          )}
          {canEditInstanceName && (
            <InstanceSettingsPopper
              active={settingsPopperActive}
              onToggle={handleToggle}
              values={previewValues ?? preferences}
              onSave={handleSaveSettings}
              onValuesChange={setPreviewValues}
              trigger={
                <Button
                  dataHook="topbar-instance-edit-icon"
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Edit instance settings"
                  aria-expanded={settingsPopperActive}
                  className={`edit-icon ${shownValues?.instance_name ? "" : "placeholder"}`}
                >
                  <Edit size="18px" />
                </Button>
              }
            />
          )}
        </Badge>
      )}
      <AccountActions>
        {settings["acl.enabled"] && currentUser && (
          <User>
            <UserIcon size="18px" />
            <Text color="contentPrimary">{currentUser}</Text>
          </User>
        )}
        {hasUIAuth(settings) && (
          <Button
            onClick={() => logout({ reload: true, clearSSOSession: true })}
            prefixIcon={<LogoutCircle size="18px" />}
            variant="secondary"
            data-hook="button-logout"
          >
            Logout
          </Button>
        )}
      </AccountActions>
    </Root>
  )
}
