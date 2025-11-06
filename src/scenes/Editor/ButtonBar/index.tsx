import React, { useCallback, useState, useEffect, useRef } from "react"
import styled, { css } from "styled-components"
import { useDispatch, useSelector } from "react-redux"
import { Stop, Loader3 } from "@styled-icons/remix-line"
import { CornerDownLeft } from "@styled-icons/evaicons-solid"
import { CloseOutline } from "@styled-icons/evaicons-outline"
import { ChevronDown } from "@styled-icons/boxicons-solid"
import {
  Box,
  Button,
  ExplainQueryButton,
  GenerateSQLButton,
  PopperToggle,
  spinAnimation
} from "../../../components"
import { FixQueryButton} from "./FixQueryButton";
import { actions, selectors } from "../../../store"
import { platform, color } from "../../../utils"
import { RunningType } from "../../../store/Query/types"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { useAIStatus, AIOperationStatus, isBlockingAIStatus } from "../../../providers/AIStatusProvider"
import type { ExecutionRefs } from "../../../scenes/Editor"

type ButtonBarProps = {
  onTriggerRunScript: (runAll?: boolean) => void
  isTemporary: boolean | undefined
  executionRefs?: React.MutableRefObject<ExecutionRefs>
  onBufferContentChange?: (value?: string) => void
}

const ButtonBarWrapper = styled.div<{ $searchWidgetType: "find" | "replace" | null, $aiAssistantEnabled: boolean }>`
  ${({ $aiAssistantEnabled, $searchWidgetType }) => !$aiAssistantEnabled ? css`
    position: absolute;
    top: ${$searchWidgetType === "replace" ? '8.2rem' : $searchWidgetType === "find" ? '5.3rem' : '1rem'};
    right: 2.4rem;
    z-index: 1;
    transition: top .1s linear;
    display: flex;
    gap: 1rem;
    align-items: center;
  ` : css`
    padding: 1rem 0;
    display: flex;
    gap: 1rem;
    align-items: center;
    margin: 0 2.4rem;
  `}
`

const StatusIndicator = styled.div<{ $aborted: boolean, $loading: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${color("gray2")};
  ${({ $aborted }) => $aborted && css`
    color: ${color("red")};
  `}
  
  ${({ $loading }) => $loading && css`
    @keyframes slide {
      0% { 
        background-position: 200% center;
      }
      100% { 
        background-position: -200% center;
      }
    }
    
    background: linear-gradient(
      90deg,
      ${color("gray2")} 0%,
      ${color("gray2")} 40%,
      ${color("white")} 50%,
      ${color("gray2")} 60%,
      ${color("gray2")} 100%
    );
    background-size: 200% auto;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-fill-color: transparent;
    animation: slide 3s linear infinite;
  `}
`;

const StatusLoader = styled(Loader3)`
  width: 2rem;
  color: ${color("pink")};
  ${spinAnimation};
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

const DropdownMenu = styled.div`
  background: ${color("backgroundDarker")};
  border-radius: 0.4rem;
  box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.3);
  overflow: hidden;
  transform: translateX(-7rem) translateY(0.5rem);
  padding: 0;
  min-width: unset;
  border: 0;

  > * {
    justify-content: space-between;
    width: 100%;
    font-size: 1.4rem;
  }
`

const Key = styled(Box).attrs({ alignItems: "center" })`
  padding: 0 0.4rem;
  background: ${({ theme }) => theme.color.selectionDarker};
  border-radius: 0.2rem;
  font-size: 1.2rem;
  height: 1.8rem;
  color: ${color("green")};

  &:not(:last-child) {
    margin-right: 0.25rem;
  }

  svg {
    color: ${color("green")} !important;
  }
`

const RunShortcut = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  margin-left: 1rem;
`

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"
const shortcutTitles =
  platform.isMacintosh || platform.isIOS
    ? {
        [RunningType.QUERY]: "Run query (Cmd+Enter)",
        [RunningType.SCRIPT]: "Run all queries (Cmd+Shift+Enter)",
      }
    : {
        [RunningType.QUERY]: "Run query (Ctrl+Enter)",
        [RunningType.SCRIPT]: "Run all queries (Ctrl+Shift+Enter)",
      }

const ButtonBar = ({
  onTriggerRunScript,
  isTemporary,
  executionRefs,
  onBufferContentChange,
}: ButtonBarProps) => {
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const activeNotification = useSelector(selectors.query.getActiveNotification)
  const { aiAssistantSettings } = useLocalStorage()
  const { status: aiStatus } = useAIStatus()
  const [dropdownActive, setDropdownActive] = useState(false)
  const [searchWidgetType, setSearchWidgetType] = useState<
    "find" | "replace" | null
  >(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const aiAssistantEnabled = !!aiAssistantSettings.apiKey && !!aiAssistantSettings.model

  const hasQueryError = activeNotification?.type === 'error' && !activeNotification?.isExplain
  const [searchWidgetType, setSearchWidgetType] = useState<
    "find" | "replace" | null
  >(null)

  const handleClickQueryButton = useCallback(() => {
    if (queriesToRun.length > 1) {
      onTriggerRunScript()
    } else {
      dispatch(actions.query.toggleRunning())
    }
  }, [dispatch, queriesToRun, onTriggerRunScript])

  const handleClickScriptButton = useCallback(() => {
    onTriggerRunScript(true)
    setDropdownActive(false)
  }, [dispatch, onTriggerRunScript])

  const handleDropdownToggle = useCallback((active: boolean) => {
    setDropdownActive(active)
  }, [])

  useEffect(() => {
    if (aiAssistantEnabled) {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      return
    }

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
  }, [aiAssistantEnabled])

  const renderRunScriptButton = () => {
    if (running === RunningType.SCRIPT) {
      return (
        <StopButton
          skin="error"
          data-hook="button-cancel-script"
          onClick={handleClickScriptButton}
          prefixIcon={<Stop size="18px" />}
        >
          Cancel
        </StopButton>
      )
    }
    return (
      <SuccessButton
        skin="success"
        data-hook="button-run-script"
        title={shortcutTitles[RunningType.SCRIPT]}
        onClick={handleClickScriptButton}
        disabled={running !== RunningType.NONE || isTemporary}
      >
        Run all queries
        <RunShortcut>
          <Key>{ctrlCmd}</Key>
          <Key>⇧</Key>
          <Key>
            <CornerDownLeft size="16px" />
          </Key>
        </RunShortcut>
      </SuccessButton>
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
            queriesToRun.length === 0 ||
            isTemporary
          }
        >
          {getQueryButtonText()}
          <RunShortcut>
            <Key>{ctrlCmd}</Key>
            <Key>
              <CornerDownLeft size="16px" />
            </Key>
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
            >
              <ChevronDown size="16px" />
            </DropdownButton>
          }
        >
          <DropdownMenu>{renderRunScriptButton()}</DropdownMenu>
        </PopperToggle>
      </ButtonGroup>
    )
  }

  return (
    <ButtonBarWrapper $searchWidgetType={searchWidgetType} $aiAssistantEnabled={aiAssistantEnabled}>
      <GenerateSQLButton
        onBufferContentChange={onBufferContentChange}
      />
      <ExplainQueryButton
          onBufferContentChange={onBufferContentChange}
        />
      {hasQueryError && queriesToRun.length === 1 && (
        <FixQueryButton
          executionRefs={executionRefs}
          onBufferContentChange={onBufferContentChange}
        />
      )}
      {aiStatus && (
        <StatusIndicator $aborted={aiStatus === AIOperationStatus.Aborted} $loading={isBlockingAIStatus(aiStatus)}>
          {aiStatus === AIOperationStatus.Aborted ? <CloseOutline size="18px" /> : <StatusLoader />}
          {aiStatus}
        </StatusIndicator>
      )}
      {running === RunningType.SCRIPT
        ? renderRunScriptButton()
        : renderRunQueryButton()
      }
    </ButtonBarWrapper>
  )
}

export default ButtonBar

