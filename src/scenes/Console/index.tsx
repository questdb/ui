import React, { useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import styled from "styled-components"
import { Tooltip } from "../../components"
import Editor from "../Editor"
import Result from "../Result"
import Schema from "../Schema"
import { useScreenSize } from "../../hooks"
import { ZeroState } from "./zero-state"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { useSelector } from "react-redux"
import { actions, selectors } from "../../store"
import { Sidebar } from "../../components/Sidebar"
import { Navigation } from "../../components/Sidebar/navigation"
import { Database2, Grid, PieChart, FileSearch } from "@styled-icons/remix-line"
import { ResultViewMode } from "./types"
import { BUTTON_ICON_SIZE } from "../../consts"
import { PrimaryToggleButton } from "../../components"
import { Import } from "./import"
import { BottomPanel } from "../../store/Console/types"
import { Allotment, AllotmentHandle } from "allotment"
import { Import as ImportIcon } from "../../components/icons/import"
import { useSettings, useSearch } from "../../providers"
import { SearchPanel } from "../Search"
import { LeftPanelType } from "../../providers/LocalStorageProvider/types"
import { color } from "../../utils/styled"
import { AIStatusIndicator } from "../../components/AIStatusIndicator"

const Root = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
  max-height: 100%;
`

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-width: 0;
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

const SidePanelRight = styled.div`
  background: ${color("chatBackground")};
  height: 100%;
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
  const {
    resultsSplitterBasis,
    updateSettings,
    leftPanelState,
    updateLeftPanelState,
    aiChatPanelWidth,
    updateAiChatPanelWidth,
  } = useLocalStorage()
  const result = useSelector(selectors.query.getResult)
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const activeBottomPanel = useSelector(selectors.console.getActiveBottomPanel)
  const { consoleConfig } = useSettings()
  const { isSearchPanelOpen, setSearchPanelOpen, searchPanelRef } = useSearch()

  const isDataSourcesPanelOpen =
    leftPanelState.type === LeftPanelType.DATASOURCES

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
        onDragEnd={(sizes) => {
          // sizes[1] is the AI chat panel width when it's open
          if (activeSidebar !== null && sizes[1] !== undefined) {
            updateAiChatPanelWidth(sizes[1])
          }
        }}
      >
        <Allotment.Pane>
          <MainContent>
            <Allotment
              vertical
              onDragEnd={(sizes) => {
                updateSettings(StoreKey.RESULTS_SPLITTER_BASIS, sizes[0])
              }}
            >
              <Allotment.Pane
                minSize={100}
                preferredSize={resultsSplitterBasis}
              >
                <Top>
                  <Sidebar align="top">
                    {!sm && (
                      <Tooltip
                        placement="right"
                        content={`${isDataSourcesPanelOpen ? "Hide" : "Show"} data sources`}
                      >
                        <Navigation
                          data-hook="tables-panel-button"
                          direction="left"
                          onClick={() => {
                            if (isDataSourcesPanelOpen) {
                              void trackEvent(ConsoleEvent.SCHEMA_OPEN)
                              updateLeftPanelState({
                                type: null,
                                width: leftPanelState.width,
                              })
                            } else {
                              void trackEvent(ConsoleEvent.SCHEMA_CLOSE)
                              updateLeftPanelState({
                                type: LeftPanelType.DATASOURCES,
                                width: leftPanelState.width,
                              })
                            }
                          }}
                          selected={isDataSourcesPanelOpen}
                        >
                          <Database2 size={BUTTON_ICON_SIZE} />
                        </Navigation>
                      </Tooltip>
                    )}
                    <Tooltip
                      placement="right"
                      content={
                        isSearchPanelOpen
                          ? "Hide search in tabs"
                          : "Search in tabs"
                      }
                    >
                      <Navigation
                        data-hook="search-panel-button"
                        direction="left"
                        onClick={() => {
                          if (!isSearchPanelOpen) {
                            void trackEvent(ConsoleEvent.SEARCH_OPEN)
                          }
                          setSearchPanelOpen(!isSearchPanelOpen)
                        }}
                        selected={isSearchPanelOpen}
                      >
                        <FileSearch size={BUTTON_ICON_SIZE} />
                      </Navigation>
                    </Tooltip>
                  </Sidebar>
                  <Allotment
                    proportionalLayout={false}
                    ref={horizontalSplitterRef}
                    onDragEnd={(sizes) => {
                      if (sizes[0] !== 0) {
                        updateLeftPanelState({
                          type: leftPanelState.type,
                          width: sizes[0],
                        })
                      }
                    }}
                    snap
                  >
                    <Allotment.Pane
                      preferredSize={leftPanelState.width}
                      visible={
                        (isDataSourcesPanelOpen || isSearchPanelOpen) && !sm
                      }
                      minSize={320}
                    >
                      <Schema open={isDataSourcesPanelOpen} />
                      <SearchPanel
                        ref={searchPanelRef}
                        open={isSearchPanelOpen}
                      />
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
                        <Tooltip
                          key={mode}
                          placement="right"
                          content={tooltipText}
                        >
                          <Navigation
                            data-hook={`${mode}-panel-button`}
                            direction="left"
                            onClick={() => {
                              void trackEvent(
                                ConsoleEvent.PANEL_BOTTOM_SWITCH,
                                {
                                  panel: mode,
                                },
                              )
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
                        </Tooltip>
                      ))}
                    <Tooltip
                      placement="right"
                      content={
                        consoleConfig.readOnly
                          ? "To use this feature, turn off read-only mode in the configuration file"
                          : "Import files from CSV"
                      }
                    >
                      <PrimaryToggleButton
                        readOnly={consoleConfig.readOnly}
                        {...(!consoleConfig.readOnly && {
                          onClick: () => {
                            void trackEvent(ConsoleEvent.PANEL_BOTTOM_SWITCH, {
                              panel: "import",
                            })
                            dispatch(
                              actions.console.setActiveBottomPanel("import"),
                            )
                          },
                        })}
                        selected={activeBottomPanel === "import"}
                        data-hook="import-panel-button"
                      >
                        <ImportIcon size={BUTTON_ICON_SIZE} />
                      </PrimaryToggleButton>
                    </Tooltip>
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
              </Allotment.Pane>
            </Allotment>
          </MainContent>
          <AIStatusIndicator />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={470}
          preferredSize={aiChatPanelWidth}
          visible={!!activeSidebar}
        >
          <SidePanelRight id="side-panel-right" />
        </Allotment.Pane>
      </Allotment>
    </Root>
  )
}

export default Console
