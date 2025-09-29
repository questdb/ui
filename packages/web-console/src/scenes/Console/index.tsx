import React, { useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import styled from "styled-components"
import { useScreenSize, PopperHover } from "../../components"
import Editor from "../Editor"
import Result from "../Result"
import Schema from "../Schema"
import { ZeroState } from "./zero-state"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { useSelector } from "react-redux"
import { actions, selectors } from "../../store"
import { Tooltip } from "../../components"
import { Sidebar } from "../../components/Sidebar"
import { Navigation } from "../../components/Sidebar/navigation"
import { Database2, Grid, PieChart, FileSearch } from "@styled-icons/remix-line"
import { ResultViewMode } from "./types"
import { BUTTON_ICON_SIZE } from "../../consts"
import { PrimaryToggleButton } from "../../components"
import { Import } from "../Import"
import { DropdownMenu } from "../../components/DropdownMenu"
import { BottomPanel } from "../../store/Console/types"
import { Allotment, AllotmentHandle } from "allotment"
import { Import as ImportIcon } from "../../components/icons/import"
import { useSettings, useSearch } from "../../providers"
import { SearchPanel } from "../Search"
import { LeftPanelType } from "../../providers/LocalStorageProvider/types"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  max-height: 100%;
`

const Top = styled.div`
  display: flex;
  height: 100%;
  flex: 1;
  position: relative;
  overflow: hidden;
`

const Bottom = styled.div`
  display: flex;
  height: 100%;
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
  const { resultsSplitterBasis, updateSettings, leftPanelState, updateLeftPanelState } =
    useLocalStorage()
  const result = useSelector(selectors.query.getResult)
  const activeBottomPanel = useSelector(selectors.console.getActiveBottomPanel)
  const importType = useSelector(selectors.console.getImportType)
  const { consoleConfig } = useSettings()
  const { isSearchPanelOpen, setSearchPanelOpen, searchPanelRef } = useSearch()

  const isDataSourcesPanelOpen = leftPanelState.type === LeftPanelType.DATASOURCES
  
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("grid")
  const resultRef = React.useRef<HTMLDivElement>(null)
  const zeroStateRef = React.useRef<HTMLDivElement>(null)
  const importRef = React.useRef<HTMLDivElement>(null)
  const horizontalSplitterRef = React.useRef<AllotmentHandle>(null)

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
      <Allotment
        vertical={true}
        onDragEnd={(sizes) => {
          updateSettings(StoreKey.RESULTS_SPLITTER_BASIS, sizes[0])
        }}
      >
        <Allotment.Pane minSize={100} preferredSize={resultsSplitterBasis}>
          <Top>
            <Sidebar align="top">
              {!sm && (
                <PopperHover
                  placement="right"
                  trigger={
                    <Navigation
                      data-hook="tables-panel-button"
                      direction="left"
                      onClick={() => {
                        if (isDataSourcesPanelOpen) {
                          updateLeftPanelState({
                            type: null,
                            width: leftPanelState.width
                          })
                        } else {
                          updateLeftPanelState({
                            type: LeftPanelType.DATASOURCES,
                            width: leftPanelState.width
                          })
                        }
                      }}
                      selected={isDataSourcesPanelOpen}
                    >
                      <Database2 size={BUTTON_ICON_SIZE} />
                    </Navigation>
                  }
                >
                  <Tooltip>
                    {isDataSourcesPanelOpen ? "Hide" : "Show"} data sources
                  </Tooltip>
                </PopperHover>
              )}
              <PopperHover
                placement="right"
                trigger={
                  <Navigation
                    data-hook="search-panel-button"
                    direction="left"
                    onClick={() => setSearchPanelOpen(!isSearchPanelOpen)}
                    selected={isSearchPanelOpen}
                  >
                    <FileSearch size={BUTTON_ICON_SIZE} />
                  </Navigation>
                }
              >
                <Tooltip>
                  {isSearchPanelOpen ? "Hide search in tabs" : "Search in tabs"}
                </Tooltip>
              </PopperHover>
            </Sidebar>
            <Allotment
              ref={horizontalSplitterRef}
              onDragEnd={(sizes) => {
                if (sizes[0] !== 0) {
                  updateLeftPanelState({
                    type: leftPanelState.type,
                    width: sizes[0]
                  })
                }
              }}
              snap
            >
              <Allotment.Pane
                preferredSize={leftPanelState.width}
                visible={(isDataSourcesPanelOpen || isSearchPanelOpen) && !sm}
                minSize={250}
              >
                <Schema open={isDataSourcesPanelOpen} />
                <SearchPanel ref={searchPanelRef} open={isSearchPanelOpen} />
              </Allotment.Pane>
              <Allotment.Pane>
                <Editor />
              </Allotment.Pane>
            </Allotment>
          </Top>
        </Allotment.Pane>

        <Allotment.Pane minSize={100}>
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
                          dispatch(
                            actions.console.setActiveBottomPanel("result"),
                          )
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
              {consoleConfig.readOnly ? (
                <PopperHover
                  placement="right"
                  trigger={
                    <PrimaryToggleButton
                      readOnly={consoleConfig.readOnly}
                      selected={activeBottomPanel === "import"}
                      data-hook="import-panel-button"
                    >
                      <ImportIcon size={BUTTON_ICON_SIZE} />
                    </PrimaryToggleButton>
                  }
                >
                  <Tooltip>
                    To use this feature, turn off read-only mode in the configuration file
                  </Tooltip>
                </PopperHover>
              ) : (
                <DropdownMenu.Root>
                  <PopperHover
                    placement="right"
                    trigger={
                      <DropdownMenu.Trigger asChild>
                        <PrimaryToggleButton
                          selected={activeBottomPanel === "import"}
                          data-hook="import-panel-button"
                        >
                          <ImportIcon size={BUTTON_ICON_SIZE} />
                        </PrimaryToggleButton>
                      </DropdownMenu.Trigger>
                    }
                  >
                    <Tooltip>Import data</Tooltip>
                  </PopperHover>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        onSelect={() => {
                          dispatch(actions.console.setImportType("parquet"))
                          dispatch(actions.console.setActiveBottomPanel("import"))
                        }}
                      >
                        Import Parquet
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={() => {
                          dispatch(actions.console.setImportType("csv"))
                          dispatch(actions.console.setActiveBottomPanel("import"))
                        }}
                      >
                        Import CSV
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </Sidebar>
            <Tab ref={resultRef}>
              {result && <Result viewMode={resultViewMode} />}
            </Tab>
            <Tab ref={zeroStateRef}>
              <ZeroState />
            </Tab>
            <Tab ref={importRef}>
              <Import type={importType} />
            </Tab>
          </Bottom>
        </Allotment.Pane>
      </Allotment>
    </Root>
  )
}

export default Console
