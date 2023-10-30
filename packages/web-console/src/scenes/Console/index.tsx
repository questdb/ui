import React, { useEffect, useState } from "react"
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
import { selectors, actions } from "../../store"
import { Tooltip } from "../../components/Tooltip"
import { Sidebar } from "../../components/Sidebar"
import { Navigation } from "../../components/Sidebar/navigation"
import { Database2, Grid, PieChart, Upload2 } from "@styled-icons/remix-line"
import { ResultViewMode } from "./types"
import { BUTTON_ICON_SIZE } from "../../consts/index"
import { PrimaryToggleButton } from "../../components"
import { Import } from "./import"

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

type BottomPanel = "result" | "zeroState" | "import"

const Console = () => {
  const { sm } = useScreenSize()
  const { editorSplitterBasis, resultsSplitterBasis, updateSettings } =
    useLocalStorage()
  const result = useSelector(selectors.query.getResult)
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("grid")
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("zeroState")
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
      setBottomPanel("result")
    } else if (zeroStateRef.current) {
      setBottomPanel("zeroState")
    }
  }, [result])

  useEffect(() => {
    if (bottomPanel) {
      showPanel(bottomPanel)
    }
  }, [bottomPanel])

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
            <PopperHover
              placement="bottom"
              trigger={
                <Navigation
                  direction="left"
                  onClick={() =>
                    updateSettings(
                      StoreKey.RESULTS_SPLITTER_BASIS,
                      resultsSplitterBasis === 0 ? 300 : 0,
                    )
                  }
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
                      direction="left"
                      onClick={() => {
                        setBottomPanel("result")
                        setResultViewMode(mode)
                      }}
                      selected={
                        bottomPanel === "result" && resultViewMode === mode
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
                  onClick={() => setBottomPanel("import")}
                  selected={bottomPanel === "import"}
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
