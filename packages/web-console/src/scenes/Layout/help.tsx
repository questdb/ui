import React from "react"
import { Chat3, Command, Question } from "@styled-icons/remix-line"
import {
  Discourse,
  Github,
  Slack,
  StackOverflow,
} from "@styled-icons/boxicons-logos"
import {
  Text,
  toast,
  PrimaryToggleButton,
  Link,
  PopperToggle,
} from "../../components"
import { DropdownMenu, FeedbackDialog, Box } from "@questdb/react-components"
import { BUTTON_ICON_SIZE } from "../../consts"
import { IconWithTooltip } from "../../components"
import { useState, useCallback, useContext } from "react"
import { QuestContext } from "../../providers"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import styled from "styled-components"
import { Shortcuts } from "../Editor/Shortcuts"

const HelpButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const DropdownMenuContent = styled(DropdownMenu.Content)`
  background: ${({ theme }) => theme.color.backgroundDarker};
`

const DropdownMenuItem = styled(DropdownMenu.Item)`
  color: ${({ theme }) => theme.color.foreground};
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

const MenuLink: React.FunctionComponent<{
  href: string
  text: string
}> = ({ href, text, ...rest }) => (
  <Link
    color="foreground"
    hoverColor="foreground"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...rest}
  >
    {text}
  </Link>
)

export const Help = () => {
  const { quest } = useContext(QuestContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [shortcutsPopperActive, setShortcutsPopperActive] = useState(false)
  const handleShortcutsToggle = useCallback((active: boolean) => {
    setShortcutsPopperActive(active)
  }, [])
  const [open, setOpen] = useState(false)

  return (
    <React.Fragment>
      <DropdownMenu.Root modal={false} onOpenChange={setOpen}>
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
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={(e: Event) => e.preventDefault()}>
              <Chat3 size="18px" />
              <FeedbackDialog
                withEmailInput
                title="Contact us"
                subtitle="Let us know your thoughts"
                trigger={({ setOpen }) => (
                  <Text color="foreground" onClick={() => setOpen(true)}>
                    Contact us
                  </Text>
                )}
                onSubmit={async ({
                  email,
                  message,
                }: {
                  email: string
                  message: string
                }) => {
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
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Slack size="18px" />
              <MenuLink
                data-hook="help-link-slack"
                href="https://slack.questdb.io/"
                text="Slack community"
              />
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Discourse size="18px" />
              <MenuLink
                data-hook="help-link-community"
                href="https://community.questdb.io/"
                text="Public forum"
              />
            </DropdownMenuItem>
            <DropdownMenuItem>
              <StackOverflow size="18px" />
              <MenuLink
                data-hook="help-link-stackoverflow"
                href="https://stackoverflow.com/tags/questdb"
                text="Stack Overflow"
              />
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Question size="18px" />
              <MenuLink
                data-hook="help-link-web-console-docs"
                href="https://questdb.io/docs/develop/web-console/"
                text="Web Console Docs"
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShortcutsToggle(true)}>
              <Command size="18px" />
              <Text color="foreground">Shortcuts</Text>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Github size="18px" />
              <MenuLink
                href={`https://github.com/questdb/ui/commit/${process.env.COMMIT_HASH}`}
                text={`Commit id: ${process.env.COMMIT_HASH}`}
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <PopperToggle
        active={shortcutsPopperActive}
        onToggle={handleShortcutsToggle}
        trigger={<React.Fragment />}
      >
        <Shortcuts />
      </PopperToggle>
    </React.Fragment>
  )
}
