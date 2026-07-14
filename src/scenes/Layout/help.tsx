import React, { useEffect } from "react"
import {
  Chat3,
  Command,
  ExternalLink,
  Question,
} from "@styled-icons/remix-line"
import {
  Discourse,
  Github,
  Slack,
  StackOverflow,
} from "@styled-icons/boxicons-logos"
import {
  DropdownMenu,
  toast,
  PrimaryToggleButton,
  PopperToggle,
  FeedbackDialog,
  Box,
} from "../../components"
import { MenuItemIcon } from "../../components/menuStyles"
import { BUTTON_ICON_SIZE } from "../../consts"
import { IconWithTooltip } from "../../components"
import { useKeyPress } from "../../hooks"
import { useState, useCallback, useContext } from "react"
import { QuestContext } from "../../providers"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import styled from "styled-components"
import { Shortcuts } from "../Editor/Shortcuts"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const HelpButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

const ShortcutsWrapper = styled.div`
  position: fixed;
  right: 0;
  margin-top: 4.5rem;
`

const MenuLink = styled.a`
  text-decoration: none;
  color: inherit;
`

const MenuLinkItem: React.FunctionComponent<{
  href: string
  text: string
  icon: React.ReactNode
  "data-hook"?: string
}> = ({ href, text, icon, ...rest }) => (
  <DropdownMenu.Item asChild>
    <MenuLink href={href} rel="noreferrer" target="_blank" {...rest}>
      <MenuItemIcon>{icon}</MenuItemIcon>
      {text}
      <ExternalLink size={14} />
    </MenuLink>
  </DropdownMenu.Item>
)

export const Help = () => {
  const { quest } = useContext(QuestContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [shortcutsPopperActive, setShortcutsPopperActive] = useState(false)
  const handleShortcutsToggle = useCallback((active: boolean) => {
    setShortcutsPopperActive(active)
  }, [])
  const [open, setOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const escPress = useKeyPress("Escape")

  useEffect(() => {
    if (escPress && shortcutsPopperActive) {
      setShortcutsPopperActive(false)
    }
  }, [escPress])

  return (
    <React.Fragment>
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        withEmailInput
        title="Contact us"
        subtitle="Let us know your thoughts"
        onSubmit={async ({
          email,
          message,
        }: {
          email?: string
          message: string
        }) => {
          void trackEvent(ConsoleEvent.HELP_FEEDBACK_SUBMIT)
          try {
            await quest.sendFeedback({
              email,
              message,
              telemetryConfig,
            })
            toast.success(
              "Thank you for your feedback! Our team will review it shortly.",
            )
          } catch (err) {
            toast.error("Something went wrong. Please try again later.")
            throw err
          }
        }}
      />
      <DropdownMenu.Root
        modal={false}
        onOpenChange={(open) => {
          if (open) {
            void trackEvent(ConsoleEvent.HELP_OPEN)
          }
          setOpen(open)
        }}
      >
        <DropdownMenu.Trigger asChild>
          <HelpButton
            {...(open && { selected: true })}
            data-hook="help-panel-button"
          >
            <IconWithTooltip
              icon={
                <TooltipWrapper>
                  <Question size={BUTTON_ICON_SIZE} />
                </TooltipWrapper>
              }
              placement="left"
              tooltip="Help"
            />
          </HelpButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item
              onSelect={(e: Event) => e.preventDefault()}
              onClick={() => setFeedbackOpen(true)}
              data-hook="help-link-contact-us"
              icon={<Chat3 size={16} />}
            >
              Contact us
            </DropdownMenu.Item>
            <MenuLinkItem
              data-hook="help-link-slack"
              href="https://slack.questdb.io/"
              text="Slack community"
              icon={<Slack size={16} />}
            />
            <MenuLinkItem
              data-hook="help-link-community"
              href="https://community.questdb.io/"
              text="Public forum"
              icon={<Discourse size={16} />}
            />
            <MenuLinkItem
              data-hook="help-link-stackoverflow"
              href="https://stackoverflow.com/tags/questdb"
              text="Stack Overflow"
              icon={<StackOverflow size={16} />}
            />
            <MenuLinkItem
              data-hook="help-link-web-console-docs"
              href="https://questdb.io/docs/develop/web-console/"
              text="Web Console Docs"
              icon={<Question size={16} />}
            />
            <DropdownMenu.Item
              onClick={() => handleShortcutsToggle(true)}
              icon={<Command size={16} />}
            >
              Shortcuts
            </DropdownMenu.Item>
            <MenuLinkItem
              href={`https://github.com/questdb/ui/commit/${import.meta.env.COMMIT_HASH}`}
              text={`Commit id: ${import.meta.env.COMMIT_HASH}`}
              icon={<Github size={16} />}
            />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <PopperToggle
        active={shortcutsPopperActive}
        onToggle={handleShortcutsToggle}
        trigger={<React.Fragment />}
      >
        <ShortcutsWrapper>
          <Shortcuts />
        </ShortcutsWrapper>
      </PopperToggle>
    </React.Fragment>
  )
}
