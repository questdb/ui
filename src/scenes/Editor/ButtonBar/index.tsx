import React, { useCallback, useState, useEffect, useRef } from "react"
import styled, { css } from "styled-components"
import { useDispatch, useSelector } from "react-redux"
import { Stop } from "@styled-icons/remix-line"
import { Key } from "../../../components"
import { ChevronDown } from "@styled-icons/boxicons-solid"
import { Box, Button, PopperToggle } from "../../../components"
import { actions, selectors } from "../../../store"
import { platform, color } from "../../../utils"
import { RunningType } from "../../../store/Query/types"
import { useQueryExecutionState } from "../../../hooks/useQueryExecutionState"

type ButtonBarProps = {
  onTriggerRunScript: (runAll?: boolean) => void
  onCopyLinkAllQueries: () => void
  isTemporary: boolean | undefined
}

const ButtonBarWrapper = styled.div<{
  $searchWidgetType: "find" | "replace" | null
}>`
  ${({ $searchWidgetType }) => css`
    position: absolute;
    top: ${$searchWidgetType === "replace"
      ? "calc(8.2rem + 8px)"
      : $searchWidgetType === "find"
        ? "calc(5.3rem + 8px)"
        : "1rem"};
    right: 2.4rem;
    z-index: 1;
    transition: top 0.1s linear;
    display: flex;
    gap: 1rem;
    align-items: center;
  `}

  @media (max-width: 768px) {
    display: none;
  }
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 0;
  margin-left: auto;
`

const SuccessButton = styled(Button)`
  margin-left: auto;
  background-color: ${color("greenDarker")};
  border-color: ${color("greenDarker")};
  color: ${color("foreground")};

  &:hover:not(:disabled) {
    background-color: ${color("green")};
    border-color: ${color("green")};
    color: ${color("selectionDarker")};
  }

  &:disabled {
    background-color: ${color("greenDarker")};
    border-color: ${color("greenDarker")};
    color: ${color("foreground")};
    opacity: 0.6;
  }

  svg {
    color: ${color("foreground")};
  }

  &:hover:not(:disabled) svg {
    color: ${color("gray1")};
  }

  &:disabled svg {
    color: ${color("foreground")};
  }
`

const StopButton = styled(Button)`
  margin-left: auto;
  background-color: ${color("red")};
  border-color: ${color("red")};
  color: ${color("foreground")};

  &:hover:not(:disabled) {
    background-color: ${color("red")};
    border-color: ${color("red")};
    color: ${color("foreground")};
    filter: brightness(1.2);
  }

  &:disabled {
    background-color: ${color("red")};
    border-color: ${color("red")};
    color: ${color("foreground")};
    opacity: 0.6;
  }

  svg {
    color: ${color("foreground")};
  }

  &:hover:not(:disabled) svg {
    color: ${color("foreground")};
  }

  &:disabled svg {
    color: ${color("foreground")};
  }
`

const MainRunButton = styled(SuccessButton)`
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
`

const DropdownButton = styled(SuccessButton)<{ $open: boolean }>`
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  padding: 0 0.5rem;
  min-width: auto;
  svg {
    transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
  }
`

const CopyLinkMenuButton = styled(Button)`
  background-color: ${color("backgroundDarker")};
  border-color: ${color("backgroundDarker")};
  color: ${color("foreground")};

  &:hover:not(:disabled) {
    background-color: ${color("selection")};
    border-color: ${color("selection")};
  }

  &:disabled {
    opacity: 0.6;
  }

  svg {
    color: ${color("foreground")};
  }
`

const DropdownMenu = styled.div`
  background: ${color("backgroundDarker")};
  border-radius: 0.4rem;
  box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.3);
  overflow: hidden;
  transform: translateX(-7rem) translateY(0.5rem);
  padding: 0;
  min-width: unset;
  border: 0;
  display: flex;
  flex-direction: column;

  > * {
    justify-content: space-between;
    width: 100%;
    font-size: 1.4rem;
  }
`

const RunShortcut = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  margin-left: 1rem;
`

const RUN_DROPDOWN_MENU_ID = "run-query-dropdown-menu"

const isMac = platform.isMacintosh || platform.isIOS
const ctrlCmd = isMac ? "⌘" : "Ctrl"
const altOpt = isMac ? "⌥" : "Alt"
const shortcutTitles = isMac
  ? {
      [RunningType.QUERY]: "Run query (Cmd+Enter)",
      [RunningType.SCRIPT]: "Run all queries (Cmd+Shift+Enter)",
    }
  : {
      [RunningType.QUERY]: "Run query (Ctrl+Enter)",
      [RunningType.SCRIPT]: "Run all queries (Ctrl+Shift+Enter)",
    }
const copyLinkShortcutTitle = isMac
  ? "Copy query link (Option+Shift+L)"
  : "Copy query link (Alt+Shift+L)"

const ButtonBar = ({
  onTriggerRunScript,
  onCopyLinkAllQueries,
  isTemporary,
}: ButtonBarProps) => {
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const { active: activeQueryExecution } = useQueryExecutionState()
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const [dropdownActive, setDropdownActive] = useState(false)
  const observerRef = useRef<MutationObserver | null>(null)

  const [searchWidgetType, setSearchWidgetType] = useState<
    "find" | "replace" | null
  >(null)

  const handleClickQueryButton = useCallback(() => {
    if (running !== RunningType.NONE) {
      dispatch(actions.query.toggleRunning())
      return
    }
    if (queriesToRun.length > 1) {
      onTriggerRunScript()
    } else {
      dispatch(actions.query.toggleRunning())
    }
  }, [dispatch, running, queriesToRun, onTriggerRunScript])

  const handleClickScriptButton = useCallback(() => {
    onTriggerRunScript(true)
    setDropdownActive(false)
  }, [dispatch, onTriggerRunScript])

  const handleClickCopyLink = useCallback(() => {
    onCopyLinkAllQueries()
    setDropdownActive(false)
  }, [onCopyLinkAllQueries])

  const handleDropdownToggle = useCallback((active: boolean) => {
    setDropdownActive(active)
  }, [])

  useEffect(() => {
    const checkFindWidgetVisibility = () => {
      const findWidget = document.querySelector(".find-widget")
      const isVisible = !!findWidget && findWidget.classList.contains("visible")
      const isReplace =
        !!findWidget && findWidget.classList.contains("replaceToggled")

      setSearchWidgetType(isVisible ? (isReplace ? "replace" : "find") : null)
    }

    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element
              if (
                element.classList?.contains("find-widget") ||
                element.querySelector?.(".find-widget")
              ) {
                shouldCheck = true
              }
            }
          })
        } else if (
          mutation.type === "attributes" &&
          mutation.target instanceof Element &&
          mutation.target.classList.contains("find-widget")
        ) {
          shouldCheck = true
        }
      })

      if (shouldCheck) {
        checkFindWidgetVisibility()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: false,
    })
    observerRef.current = observer

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [])

  const renderRunScriptButton = (asMenuItem: boolean = false) => {
    const menuProps = asMenuItem ? { role: "menuitem" as const } : {}
    if (running === RunningType.SCRIPT) {
      return (
        <StopButton
          skin="error"
          data-hook="button-cancel-script"
          onClick={handleClickScriptButton}
          prefixIcon={<Stop size="18px" />}
          {...menuProps}
        >
          Cancel
        </StopButton>
      )
    }
    return (
      <CopyLinkMenuButton
        skin="secondary"
        data-hook="button-run-script"
        title={shortcutTitles[RunningType.SCRIPT]}
        onClick={handleClickScriptButton}
        disabled={
          running !== RunningType.NONE ||
          activeQueryExecution !== null ||
          isTemporary
        }
        {...menuProps}
      >
        Run all queries
        <RunShortcut>
          <Key
            keyString={ctrlCmd}
            color={color("foreground")}
            hoverColor={color("foreground")}
          />
          <Key
            keyString="⇧"
            color={color("foreground")}
            hoverColor={color("foreground")}
          />
          <Key
            keyString="Enter"
            color={color("foreground")}
            hoverColor={color("foreground")}
          />
        </RunShortcut>
      </CopyLinkMenuButton>
    )
  }

  const renderRunQueryButton = () => {
    if (running !== RunningType.NONE && running !== RunningType.SCRIPT) {
      return (
        <ButtonGroup>
          <StopButton
            skin="error"
            data-hook="button-cancel-query"
            onClick={handleClickQueryButton}
            prefixIcon={<Stop size="18px" />}
          >
            Cancel
          </StopButton>
        </ButtonGroup>
      )
    }

    const getQueryButtonText = () => {
      const numQueries = queriesToRun.length
      if (numQueries === 1) {
        return queriesToRun[0].selection ? "Run selected query" : "Run query"
      }
      if (numQueries > 1) {
        return `Run ${numQueries} selected queries`
      }
      return "Run query"
    }

    return (
      <ButtonGroup>
        <MainRunButton
          skin="success"
          data-hook="button-run-query"
          title={shortcutTitles[RunningType.QUERY]}
          onClick={handleClickQueryButton}
          disabled={
            running !== RunningType.NONE ||
            activeQueryExecution !== null ||
            queriesToRun.length === 0 ||
            isTemporary
          }
        >
          {getQueryButtonText()}
          <RunShortcut>
            <Key
              keyString={ctrlCmd}
              color={color("green")}
              hoverColor={color("green")}
            />
            <Key
              keyString="Enter"
              color={color("green")}
              hoverColor={color("green")}
            />
          </RunShortcut>
        </MainRunButton>
        <PopperToggle
          active={dropdownActive}
          onToggle={handleDropdownToggle}
          placement="bottom"
          trigger={
            <DropdownButton
              skin="success"
              data-hook="button-run-query-dropdown"
              $open={dropdownActive}
              title="More run options"
              aria-label="More run options"
              aria-haspopup="menu"
              aria-expanded={dropdownActive}
              aria-controls={RUN_DROPDOWN_MENU_ID}
            >
              <ChevronDown size="16px" />
            </DropdownButton>
          }
        >
          <DropdownMenu id={RUN_DROPDOWN_MENU_ID} role="menu">
            {renderRunScriptButton(true)}
            <CopyLinkMenuButton
              skin="secondary"
              data-hook="button-copy-query-link"
              title={copyLinkShortcutTitle}
              onClick={handleClickCopyLink}
              disabled={isTemporary}
              {...{ role: "menuitem" as const }}
            >
              Copy link to all queries
              <RunShortcut>
                <Key
                  keyString={altOpt}
                  color={color("foreground")}
                  hoverColor={color("foreground")}
                />
                <Key
                  keyString="⇧"
                  color={color("foreground")}
                  hoverColor={color("foreground")}
                />
                <Key
                  keyString="L"
                  color={color("foreground")}
                  hoverColor={color("foreground")}
                />
              </RunShortcut>
            </CopyLinkMenuButton>
          </DropdownMenu>
        </PopperToggle>
      </ButtonGroup>
    )
  }

  return (
    <ButtonBarWrapper $searchWidgetType={searchWidgetType}>
      {running === RunningType.SCRIPT
        ? renderRunScriptButton()
        : renderRunQueryButton()}
    </ButtonBarWrapper>
  )
}

export default ButtonBar
