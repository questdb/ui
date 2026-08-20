import React, { useCallback, useState, useEffect, useRef } from "react"
import styled, { css } from "styled-components"
import { useDispatch, useSelector } from "react-redux"
import { Stop } from "../../../components/icons"
import { Key } from "../../../components"
import { ChevronDown } from "../../../components/icons"
import { Box, Button, PopperToggle } from "../../../components"
import { actions, selectors } from "../../../store"
import { color } from "../../../utils"
import { ctrlCmd, altOption } from "../../../utils/platform"
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
    right: 2rem;
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
  border-radius: 0.6rem;
  overflow: hidden;

  > button {
    border-radius: 0;
  }

  > button:first-child {
    border-top-left-radius: inherit;
    border-bottom-left-radius: inherit;
  }

  > button:last-child {
    border-top-right-radius: inherit;
    border-bottom-right-radius: inherit;
  }
`

const SuccessButton = styled(Button)`
  margin-left: auto;
  font-size: 1.5rem;
`

const StopButton = styled(Button)`
  margin-left: auto;
  font-size: 1.5rem;
`

const MainRunButton = styled(SuccessButton)`
  border-right: 0;
  overflow: hidden;
`

const DropdownButton = styled(SuccessButton)<{ $open: boolean }>`
  padding: 0 0.5rem;
  min-width: auto;
  svg {
    transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
  }
`

const CopyLinkMenuButton = styled(Button)`
  justify-content: space-between;
  border-radius: 0;
  font-size: 1.5rem;
`

const DropdownMenu = styled.div`
  background: ${color("surfaceInset")};
  border: 1px solid ${color("borderDefault")};
  border-radius: 0.7rem;
  box-shadow:
    0 1.2rem 3rem ${({ theme }) => theme.color.shadowMedium},
    0 0.2rem 0.6rem ${({ theme }) => theme.color.shadowSoft};
  overflow: hidden;
  transform: translateX(-7rem) translateY(0.5rem);
  padding: 0;
  min-width: unset;
  display: flex;
  flex-direction: column;

  > button {
    justify-content: space-between;
    width: 100%;
    min-height: 4rem;
    padding: 0.7rem 1.2rem;
    border: 0;
    border-radius: 0;
    font-size: 1.5rem;
  }

  > button + button {
    border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  }
`

const RunShortcut = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  margin-left: 1rem;
`

const RUN_DROPDOWN_MENU_ID = "run-query-dropdown-menu"

const shortcutTitles = {
  [RunningType.QUERY]: `Run query (${ctrlCmd}+Enter)`,
  [RunningType.SCRIPT]: `Run all queries (${ctrlCmd}+Shift+Enter)`,
}
const copyLinkShortcutTitle = `Copy query link (${altOption}+Shift+L)`

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
          variant="danger"
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
        variant="secondary"
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
          <Key keyString={ctrlCmd} color={color("contentSecondary")} />
          <Key keyString="⇧" color={color("contentSecondary")} />
          <Key keyString="Enter" color={color("contentSecondary")} />
        </RunShortcut>
      </CopyLinkMenuButton>
    )
  }

  const renderRunQueryButton = () => {
    if (running !== RunningType.NONE && running !== RunningType.SCRIPT) {
      return (
        <ButtonGroup>
          <StopButton
            variant="danger"
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
          variant="primary"
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
            <Key keyString={ctrlCmd} color={color("contentSecondary")} />
            <Key keyString="Enter" color={color("contentSecondary")} />
          </RunShortcut>
        </MainRunButton>
        <PopperToggle
          active={dropdownActive}
          onToggle={handleDropdownToggle}
          placement="bottom"
          trigger={
            <DropdownButton
              variant="primary"
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
              variant="secondary"
              data-hook="button-copy-query-link"
              title={copyLinkShortcutTitle}
              onClick={handleClickCopyLink}
              disabled={isTemporary}
              {...{ role: "menuitem" as const }}
            >
              Copy link to all queries
              <RunShortcut>
                <Key keyString={altOption} color={color("contentSecondary")} />
                <Key keyString="⇧" color={color("contentSecondary")} />
                <Key keyString="L" color={color("contentSecondary")} />
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
