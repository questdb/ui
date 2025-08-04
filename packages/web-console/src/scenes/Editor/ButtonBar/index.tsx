import React, { useCallback, useState } from "react"
import styled from "styled-components"
import { useDispatch, useSelector } from "react-redux"
import { Stop } from "@styled-icons/remix-line"
import { CornerDownLeft } from "@styled-icons/evaicons-solid"
import { ChevronDown } from "@styled-icons/boxicons-solid"
import { PopperToggle } from "../../../components"
import { ExplainQueryButton } from "../../../components/ExplainQueryButton"
import { Box, Button } from "@questdb/react-components"
import { actions, selectors } from "../../../store"
import { platform, color } from "../../../utils"
import { RunningType } from "../../../store/Query/types"

const ButtonBarWrapper = styled.div`
  position: absolute;
  top: 1rem;
  right: 2.4rem;
  z-index: 1;
  display: flex;
  gap: 1rem;
  align-items: center;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 0;
`

const SuccessButton = styled(Button)`
  background-color: ${color("greenDarker")};
  border-color: ${color("greenDarker")};
  color: ${color("foreground")};

  &:hover:not(:disabled) {
    background-color: ${color("green")};
    border-color: ${color("green")};
    color: ${color("gray1")};
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
    transform: ${({ $open }) => $open ? "rotate(180deg)" : "rotate(0deg)"};
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
  background: ${color("gray1")};
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
const shortcutTitles = platform.isMacintosh || platform.isIOS ? {
  [RunningType.QUERY]: "Cmd+Enter",
  [RunningType.SCRIPT]: "Cmd+Shift+Enter",
} : {
  [RunningType.QUERY]: "Ctrl+Enter",
  [RunningType.SCRIPT]: "Ctrl+Shift+Enter",
}

const ButtonBar = ({ 
  onTriggerRunScript, 
  editor 
}: { 
  onTriggerRunScript: (runAll?: boolean) => void
  editor: any
}) => {
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const [dropdownActive, setDropdownActive] = useState(false)

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
        disabled={running !== RunningType.NONE}
      >
          Run all queries
        <RunShortcut> 
          <Key>{ctrlCmd}</Key>
          <Key>⇧</Key>
          <Key><CornerDownLeft size="16px" /></Key>
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
          disabled={running !== RunningType.NONE || queriesToRun.length === 0}
        >
          {getQueryButtonText()}
          <RunShortcut>
            <Key>{ctrlCmd}</Key>
            <Key><CornerDownLeft size="16px" /></Key>
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
          <DropdownMenu>
            {renderRunScriptButton()}
          </DropdownMenu>
        </PopperToggle>
      </ButtonGroup>
    )
  }

  return (
    <ButtonBarWrapper>
      <ExplainQueryButton 
        editor={editor} 
        disabled={running !== RunningType.NONE || queriesToRun.length === 0}
      />
      {running === RunningType.SCRIPT ? renderRunScriptButton() : renderRunQueryButton()}
    </ButtonBarWrapper>
  )
}

export default ButtonBar