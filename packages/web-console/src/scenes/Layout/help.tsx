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

const ShortcutsWrapper = styled.div`
  position: fixed;
  right: 0;
  margin-top: 4.5rem;
`

const MenuLink: React.FunctionComponent<{
  href: string
  text: string
  icon: React.ReactNode
}> = ({ href, text, icon, ...rest }) => (
  <Link
    color="foreground"
    hoverColor="foreground"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...rest}
  >
    {icon}
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
  const [feedbackOpen, setFeedbackOpen] = useState(false)

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
            <DropdownMenuItem
              onSelect={(e: Event) => e.preventDefault()}
              onClick={() => setFeedbackOpen(true)}
              data-hook="help-link-contact-us"
            >
              <Chat3 size="18px" />
              <Text color="foreground">Contact us</Text>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <MenuLink
                data-hook="help-link-slack"
                href="https://slack.questdb.io/"
                text="Slack community"
                icon={<Slack size="18px" />}
              />
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <MenuLink
                data-hook="help-link-community"
                href="https://community.questdb.io/"
                text="Public forum"
                icon={<Discourse size="18px" />}
              />
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <MenuLink
                data-hook="help-link-stackoverflow"
                href="https://stackoverflow.com/tags/questdb"
                text="Stack Overflow"
                icon={<StackOverflow size="18px" />}
              />
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <MenuLink
                data-hook="help-link-web-console-docs"
                href="https://questdb.io/docs/develop/web-console/"
                text="Web Console Docs"
                icon={<Question size="18px" />}
              />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShortcutsToggle(true)}>
              <Command size="18px" />
              <Text color="foreground">Shortcuts</Text>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <MenuLink
                href={`https://github.com/questdb/ui/commit/${process.env.COMMIT_HASH}`}
                text={`Commit id: ${process.env.COMMIT_HASH}`}
                icon={<Github size="18px" />}
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
        <ShortcutsWrapper>
          <Shortcuts />
        </ShortcutsWrapper>
      </PopperToggle>
    </React.Fragment>
  )
}
