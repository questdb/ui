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
  Text,
  toast,
  PrimaryToggleButton,
  Link,
  PopperToggle,
} from "../../components"
import {
  DropdownMenu,
  FeedbackDialog,
  ForwardRef,
  Box,
} from "@questdb/react-components"
import { BUTTON_ICON_SIZE } from "../../consts"
import { IconWithTooltip, useKeyPress } from "../../components"
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

const DropdownMenuItem = styled(DropdownMenu.Item)<{ withlink?: string }>`
  color: ${({ theme }) => theme.color.foreground};
  ${({ withlink }) => withlink && "padding: 0;"}
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

const StyledLink = styled(Link)`
  padding: 0.5rem 1rem;
  width: 100%;
`

const MenuLink: React.FunctionComponent<{
  href: string
  text: string
  icon: React.ReactNode
}> = ({ href, text, icon, ...rest }) => (
  <StyledLink
    color="foreground"
    hoverColor="foreground"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...rest}
  >
    <Box align="center" gap="1.5rem">
      {icon}
      <Box align="center" gap="0.75rem">
        {text}
        <ExternalLink size="14px" />
      </Box>
    </Box>
  </StyledLink>
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
            <DropdownMenuItem asChild withlink="true">
              <ForwardRef>
                <MenuLink
                  data-hook="help-link-slack"
                  href="https://slack.questdb.io/"
                  text="Slack community"
                  icon={<Slack size="18px" />}
                />
              </ForwardRef>
            </DropdownMenuItem>
            <DropdownMenuItem asChild withlink="true">
              <ForwardRef>
                <MenuLink
                  data-hook="help-link-community"
                  href="https://community.questdb.io/"
                  text="Public forum"
                  icon={<Discourse size="18px" />}
                />
              </ForwardRef>
            </DropdownMenuItem>
            <DropdownMenuItem asChild withlink="true">
              <ForwardRef>
                <MenuLink
                  data-hook="help-link-stackoverflow"
                  href="https://stackoverflow.com/tags/questdb"
                  text="Stack Overflow"
                  icon={<StackOverflow size="18px" />}
                />
              </ForwardRef>
            </DropdownMenuItem>
            <DropdownMenuItem asChild withlink="true">
              <ForwardRef>
                <MenuLink
                  data-hook="help-link-web-console-docs"
                  href="https://questdb.io/docs/develop/web-console/"
                  text="Web Console Docs"
                  icon={<Question size="18px" />}
                />
              </ForwardRef>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleShortcutsToggle(true)}>
              <Command size="18px" />
              <Text color="foreground">Shortcuts</Text>
            </DropdownMenuItem>
            <DropdownMenuItem asChild withlink="true">
              <ForwardRef>
                <MenuLink
                  href={`https://github.com/questdb/ui/commit/${process.env.COMMIT_HASH}`}
                  text={`Commit id: ${process.env.COMMIT_HASH}`}
                  icon={<Github size="18px" />}
                />
              </ForwardRef>
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
