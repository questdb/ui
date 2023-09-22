import React, { useState } from "react"
import styled from "styled-components"
import { Splitter, useScreenSize, PopperHover } from "../../components"
import Editor from "../Editor"
import Result from "../Result"
import Schema from "../Schema"
import { ZeroState } from "../Result/zero-state"
import { EditorProvider } from "../../providers"
import { useCallback } from "react"
import { BusEvent } from "../../consts"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"
import { Tooltip } from "../../components/Tooltip"
import { Sidebar } from "../../components/Sidebar"
import { color } from "../../utils"
import { Navigation } from "../../components/Sidebar/navigation"
import { Grid, PieChart } from "styled-icons/remix-line"
import { ChevronDoubleLeft } from "styled-icons/bootstrap"
import { Button } from "@questdb/react-components"
import { ViewMode } from "./types"
import { Logo } from "../../components/Logo"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  max-height: 100%;
`

const Top = styled.div`
  position: relative;
  overflow: hidden;
`

const Bottom = styled.div`
  display: flex;
  flex: 1;
`

const ToggleTablesIcon = styled(ChevronDoubleLeft)<{ splitterbasis: number }>`
  transform: rotate(
    ${({ splitterbasis }) => (splitterbasis === 0 ? "180deg" : "0deg")}
  );
`

const viewModes: {
  icon: React.ReactNode
  mode: ViewMode
  tooltipText: string
}[] = [
  {
    icon: <Grid size="18px" />,
    mode: "grid",
    tooltipText: "Grid",
  },
  {
    icon: <PieChart size="18px" />,
    mode: "chart",
    tooltipText: "Chart",
  },
]

const Console = () => {
  const { sm } = useScreenSize()
  const { editorSplitterBasis, resultsSplitterBasis, updateSettings } =
    useLocalStorage()
  const result = useSelector(selectors.query.getResult)
  const dispatch = useDispatch()
  const [resultViewMode, setResultViewMode] = useState<ViewMode>("grid")

  const handleEditorSplitterChange = useCallback((value) => {
    updateSettings(StoreKey.EDITOR_SPLITTER_BASIS, value)
    setTimeout(() => {
      window.bus.trigger(BusEvent.MSG_ACTIVE_PANEL)
    }, 0)
  }, [])

  const handleResultsSplitterChange = useCallback((value) => {
    updateSettings(StoreKey.RESULTS_SPLITTER_BASIS, value)
    setTimeout(() => {
      window.bus.trigger(BusEvent.MSG_ACTIVE_PANEL)
    }, 0)
  }, [])

  return (
    <Root>
      <EditorProvider>
        <Splitter
          direction="vertical"
          fallback={editorSplitterBasis}
          min={100}
          onChange={handleEditorSplitterChange}
        >
          <Top>
            <Sidebar>
              <Logo />
              <PopperHover
                delay={350}
                placement="bottom"
                trigger={
                  <Button
                    skin="secondary"
                    onClick={() =>
                      updateSettings(
                        StoreKey.RESULTS_SPLITTER_BASIS,
                        resultsSplitterBasis === 0 ? 300 : 0,
                      )
                    }
                  >
                    <ToggleTablesIcon
                      size="16px"
                      splitterbasis={resultsSplitterBasis}
                    />
                  </Button>
                }
              >
                <Tooltip>
                  {resultsSplitterBasis === 0 ? "Show" : "Hide"} tables
                </Tooltip>
              </PopperHover>
            </Sidebar>
            <Splitter
              direction="horizontal"
              fallback={resultsSplitterBasis}
              max={500}
              onChange={handleResultsSplitterChange}
            >
              {!sm && <Schema />}
              <Editor />
            </Splitter>
          </Top>
          <Bottom>
            <Sidebar>
              {result &&
                viewModes.map(({ icon, mode, tooltipText }) => (
                  <PopperHover
                    key={mode}
                    delay={350}
                    placement="right"
                    trigger={
                      <Navigation
                        direction="left"
                        onClick={() => setResultViewMode(mode)}
                        selected={resultViewMode === mode}
                      >
                        {icon}
                      </Navigation>
                    }
                  >
                    <Tooltip>{tooltipText}</Tooltip>
                  </PopperHover>
                ))}
            </Sidebar>
            {result ? <Result viewMode={resultViewMode} /> : <ZeroState />}
          </Bottom>
        </Splitter>
      </EditorProvider>
    </Root>
  )
}

export default Console
