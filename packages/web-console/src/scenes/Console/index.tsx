import React, { useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import styled from "styled-components"
import { Splitter, useScreenSize, PopperHover } from "../../components"
import Editor from "../Editor"
import Result from "../Result"
import Schema from "../Schema"
import { ZeroState } from "./zero-state"
import { useCallback } from "react"
import { BusEvent } from "../../consts"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { useSelector } from "react-redux"
import { actions, selectors } from "../../store"
import { Tooltip } from "../../components"
import { Sidebar } from "../../components/Sidebar"
import { Navigation } from "../../components/Sidebar/navigation"
import { Database2, Grid, PieChart, Upload2 } from "@styled-icons/remix-line"
import { ResultViewMode } from "./types"
import { BUTTON_ICON_SIZE } from "../../consts"
import { PrimaryToggleButton } from "../../components"
import { Import } from "./import"
import { BottomPanel } from "../../store/Console/types"

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
  min-height: 0px;
`

const Tab = styled.div`
  display: flex;
  width: calc(100% - 4.5rem);
  height: 100%;
  overflow: auto;
`

const viewModes: {
  icon: React.ReactNode
  mode: ResultViewMode
  tooltipText: string
}[] = [
  {
    icon: <Grid size={BUTTON_ICON_SIZE} />,
    mode: "grid",
    tooltipText: "Grid",
  },
  {
    icon: <PieChart size={BUTTON_ICON_SIZE} />,
    mode: "chart",
    tooltipText: "Chart",
  },
]

const Console = () => {
  const dispatch = useDispatch()
  const { sm } = useScreenSize()
  const { editorSplitterBasis, resultsSplitterBasis, updateSettings } =
    useLocalStorage()
  const result = useSelector(selectors.query.getResult)
  const activeBottomPanel = useSelector(selectors.console.getActiveBottomPanel)
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("grid")
  const resultRef = React.useRef<HTMLDivElement>(null)
  const zeroStateRef = React.useRef<HTMLDivElement>(null)
  const importRef = React.useRef<HTMLDivElement>(null)

  const showPanel = (panel: BottomPanel) => {
    if (resultRef.current) {
      resultRef.current.style.display = panel === "result" ? "flex" : "none"
    }
    if (zeroStateRef.current) {
      zeroStateRef.current.style.display =
        panel === "zeroState" ? "flex" : "none"
    }
    if (importRef.current) {
      importRef.current.style.display = panel === "import" ? "flex" : "none"
    }
  }

  const handleEditorSplitterChange = useCallback((value) => {
    updateSettings(StoreKey.EDITOR_SPLITTER_BASIS, value)
    setTimeout(() => {
      window.bus.trigger(BusEvent.MSG_ACTIVE_SIDEBAR)
    }, 0)
  }, [])

  const handleResultsSplitterChange = useCallback((value) => {
    updateSettings(StoreKey.RESULTS_SPLITTER_BASIS, value)
    setTimeout(() => {
      window.bus.trigger(BusEvent.MSG_ACTIVE_SIDEBAR)
    }, 0)
  }, [])

  useEffect(() => {
    if (resultRef.current && result) {
      dispatch(actions.console.setActiveBottomPanel("result"))
    } else if (zeroStateRef.current) {
      dispatch(actions.console.setActiveBottomPanel("zeroState"))
    }
  }, [result])

  useEffect(() => {
    showPanel(activeBottomPanel)
  }, [activeBottomPanel])

  return (
    <Root>
      <Splitter
        direction="vertical"
        fallback={editorSplitterBasis}
        min={100}
        onChange={handleEditorSplitterChange}
      >
        <Top>
          <Sidebar align="top">
            {!sm && (
              <PopperHover
                placement="bottom"
                trigger={
                  <Navigation
                    data-hook="tables-panel-button"
                    direction="left"
                    onClick={() => {
                      dispatch(
                        actions.console.setActiveTopPanel(
                          resultsSplitterBasis === 0 ? "tables" : undefined,
                        ),
                      )
                      updateSettings(
                        StoreKey.RESULTS_SPLITTER_BASIS,
                        resultsSplitterBasis === 0 ? 300 : 0,
                      )
                    }}
                    selected={resultsSplitterBasis !== 0}
                  >
                    <Database2 size={BUTTON_ICON_SIZE} />
                  </Navigation>
                }
              >
                <Tooltip>
                  {resultsSplitterBasis === 0 ? "Show" : "Hide"} tables
                </Tooltip>
              </PopperHover>
            )}
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
          <Sidebar align="bottom">
            {result &&
              viewModes.map(({ icon, mode, tooltipText }) => (
                <PopperHover
                  key={mode}
                  placement="right"
                  trigger={
                    <Navigation
                      data-hook={`${mode}-panel-button`}
                      direction="left"
                      onClick={() => {
                        dispatch(actions.console.setActiveBottomPanel("result"))
                        setResultViewMode(mode)
                      }}
                      selected={
                        activeBottomPanel === "result" &&
                        resultViewMode === mode
                      }
                    >
                      {icon}
                    </Navigation>
                  }
                >
                  <Tooltip>{tooltipText}</Tooltip>
                </PopperHover>
              ))}
            <PopperHover
              placement="right"
              trigger={
                <PrimaryToggleButton
                  onClick={() => {
                    dispatch(actions.console.setActiveBottomPanel("import"))
                  }}
                  selected={activeBottomPanel === "import"}
                  data-hook="import-panel-button"
                >
                  <Upload2 size={BUTTON_ICON_SIZE} />
                </PrimaryToggleButton>
              }
            >
              <Tooltip>Import files from CSV</Tooltip>
            </PopperHover>
          </Sidebar>
          <Tab ref={resultRef}>
            {result && <Result viewMode={resultViewMode} />}
          </Tab>
          <Tab ref={zeroStateRef}>
            <ZeroState />
          </Tab>
          <Tab ref={importRef}>
            <Import />
          </Tab>
        </Bottom>
      </Splitter>
    </Root>
  )
}

export default Console
