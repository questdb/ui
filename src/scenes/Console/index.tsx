import React, { useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import styled from "styled-components"
import { Tooltip } from "../../components"
import Editor from "../Editor"
import Result from "../Result"
import Schema from "../Schema"
import { ScreenSize, useScreenSize } from "../../hooks"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { getValue } from "../../utils/localStorage"
import { hasExampleDashboards } from "../../utils/examples/hasExampleDashboards"
import { useSelector } from "react-redux"
import { actions, selectors } from "../../store"
import { Sidebar } from "../../components/Sidebar"
import { Navigation } from "../../components/Sidebar/navigation"
import { Database2, FileSearch } from "../../components/icons"
import {
  CardsThreeIcon,
  ChartLineIcon,
  GridNineIcon,
} from "@phosphor-icons/react"
import { ResultViewMode } from "./types"
import { SIDEBAR_ICON_SIZE } from "../../consts"
import { PrimaryToggleButton } from "../../components"
import { Import } from "./import"
import { BottomPanel } from "../../store/Console/types"
import { Allotment, AllotmentHandle, LayoutPriority } from "allotment"
import { Import as ImportIcon } from "../../components/icons/import"
import { useSettings, useSearch } from "../../providers"
import { SearchPanel } from "../Search"
import { TabsPanel } from "../TabsPanel"
import { LeftPanelType } from "../../providers/LocalStorageProvider/types"
import { AIStatusIndicator } from "../../components/AIStatusIndicator"
import { useActiveBufferSummary } from "../../providers/EditorProvider"

const Root = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
  max-height: 100%;
  background: ${({ theme }) => theme.color.surfaceCanvas};
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

const ContentArea = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
`

const Bottom = styled.div`
  display: flex;
  height: 100%;
  flex: 1;
  min-height: 0px;
`

const Tab = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  overflow: auto;
`

const SidebarSpacer = styled.div`
  flex: 1;
`

const SidePanelRight = styled.div`
  background: ${({ theme }) => theme.color.surfaceRaised};
  height: 100%;
  border-left: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Wrapper = styled.div`
  height: 100%;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border-right: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const viewModes: {
  icon: React.ReactNode
  mode: ResultViewMode
  tooltipText: string
}[] = [
  {
    icon: <GridNineIcon size={SIDEBAR_ICON_SIZE} />,
    mode: "grid",
    tooltipText: "Grid",
  },
  {
    icon: <ChartLineIcon size={SIDEBAR_ICON_SIZE} />,
    mode: "chart",
    tooltipText: "Chart",
  },
]

const Console = () => {
  const dispatch = useDispatch()
  const screenSize = useScreenSize()
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
  const resultSource = useSelector(selectors.query.getResultSource)
  const activeBufferSummary = useActiveBufferSummary()
  // A notebook uses the full workspace, so the SQL editor's result stays
  // mounted but hidden for the return trip. A result produced while the
  // notebook is active (e.g. an AI chat run) belongs to it and is shown.
  const hideResult =
    activeBufferSummary.isNotebook &&
    resultSource?.bufferId !== activeBufferSummary.id
  const { isSearchPanelOpen, setSearchPanelOpen, searchPanelRef } = useSearch()

  const isDataSourcesPanelOpen =
    leftPanelState.type === LeftPanelType.DATASOURCES
  const isTabsPanelOpen = leftPanelState.type === LeftPanelType.TABS

  // Showcase deployments (console-configuration.json ships example dashboards)
  // open the Tabs panel on the first visit, so the examples are the first thing
  // a visitor sees. Once the user has toggled any panel, their choice wins.
  const showcase = hasExampleDashboards(consoleConfig)
  useEffect(() => {
    if (!showcase || getValue(StoreKey.LEFT_PANEL_STATE) !== "") return
    if (leftPanelState.type !== LeftPanelType.TABS) {
      updateLeftPanelState({
        type: LeftPanelType.TABS,
        width: leftPanelState.width,
      })
    }
  }, [showcase])

  const toggleTabsPanel = () => {
    if (!isTabsPanelOpen) {
      void trackEvent(ConsoleEvent.TAB_PANEL_OPEN)
    }
    updateLeftPanelState({
      type: isTabsPanelOpen ? null : LeftPanelType.TABS,
      width: leftPanelState.width,
    })
  }

  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("grid")
  const resultRef = React.useRef<HTMLDivElement>(null)
  const importRef = React.useRef<HTMLDivElement>(null)
  const horizontalSplitterRef = React.useRef<AllotmentHandle>(null)
  const previousScreenSizeRef = React.useRef(ScreenSize.XL)

  // A hidden result is also taken out of the layout, not only collapsed: its
  // controls would otherwise stay focusable and announced while invisible,
  // and act on another tab's result.
  const showPanel = (panel: BottomPanel, resultHidden: boolean) => {
    if (resultRef.current) {
      resultRef.current.style.display =
        panel === "result" && !resultHidden ? "flex" : "none"
    }
    if (importRef.current) {
      importRef.current.style.display = panel === "import" ? "flex" : "none"
    }
  }

  // The bottom panel follows each new result, as it does for a result run
  // on screen, but only once the result is visible: one that belongs to
  // another tab must not collapse the pane over what the user has open (e.g.
  // Import). It applies when its tab is shown again. The first render applies
  // too, so a console mounted on a notebook tab (e.g. after signing in again)
  // corrects a panel left by the previous session.
  const appliedResultRef = React.useRef<{ result: typeof result }>()
  const mountResultRef = React.useRef(result)
  useEffect(() => {
    const applied = appliedResultRef.current
    if (hideResult || (applied && applied.result === result)) return
    appliedResultRef.current = { result }
    // The first apply corrects a panel left by a previous session. With no
    // new result since mounting, an Import panel open now was opened by the
    // user, not left over.
    if (
      !applied &&
      result === mountResultRef.current &&
      activeBottomPanel === "import"
    )
      return
    dispatch(
      actions.console.setActiveBottomPanel(
        resultRef.current && result ? "result" : "zeroState",
      ),
    )
  }, [result, hideResult])

  useEffect(() => {
    showPanel(activeBottomPanel, hideResult)
  }, [activeBottomPanel, hideResult])

  useEffect(() => {
    const previousScreenSize = previousScreenSizeRef.current
    previousScreenSizeRef.current = screenSize
    const shrankInto = (size: ScreenSize) =>
      previousScreenSize > size && screenSize <= size

    if (shrankInto(ScreenSize.LG) || shrankInto(ScreenSize.SM)) {
      dispatch(actions.console.closeSidebar())
    }
    if (shrankInto(ScreenSize.MD) || shrankInto(ScreenSize.SM)) {
      updateLeftPanelState({ type: null, width: leftPanelState.width })
      setSearchPanelOpen(false)
    }
  }, [screenSize])

  return (
    <Root>
      <Allotment
        proportionalLayout={false}
        onDragEnd={(sizes) => {
          // sizes[1] is the AI chat panel width when it's open
          if (activeSidebar !== null && sizes[1] !== undefined) {
            updateAiChatPanelWidth(sizes[1])
          }
        }}
      >
        <Allotment.Pane priority={LayoutPriority.High}>
          <MainContent>
            <ContentArea>
              <Sidebar align="top">
                <Tooltip
                  placement="right"
                  content={`${isDataSourcesPanelOpen ? "Hide" : "Show"} data sources`}
                >
                  <Navigation
                    aria-label={
                      isDataSourcesPanelOpen
                        ? "Hide data sources"
                        : "Show data sources"
                    }
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
                    <Database2 size={SIDEBAR_ICON_SIZE} />
                  </Navigation>
                </Tooltip>
                <Tooltip
                  placement="right"
                  content={isTabsPanelOpen ? "Hide tabs" : "Show tabs"}
                >
                  <Navigation
                    aria-label={isTabsPanelOpen ? "Hide tabs" : "Show tabs"}
                    data-hook="tabs-panel-button"
                    direction="left"
                    onClick={toggleTabsPanel}
                    selected={isTabsPanelOpen}
                  >
                    <CardsThreeIcon size={SIDEBAR_ICON_SIZE} />
                  </Navigation>
                </Tooltip>
                <Tooltip
                  placement="right"
                  content={
                    isSearchPanelOpen ? "Hide search in tabs" : "Search in tabs"
                  }
                >
                  <Navigation
                    aria-label={
                      isSearchPanelOpen
                        ? "Hide search in tabs"
                        : "Search in tabs"
                    }
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
                    <FileSearch size={SIDEBAR_ICON_SIZE} />
                  </Navigation>
                </Tooltip>
                <SidebarSpacer />
                {result &&
                  !hideResult &&
                  viewModes.map(({ icon, mode, tooltipText }) => (
                    <Tooltip key={mode} placement="right" content={tooltipText}>
                      <Navigation
                        aria-label={`${tooltipText} result panel`}
                        aria-pressed={
                          activeBottomPanel === "result" &&
                          resultViewMode === mode
                        }
                        data-hook={`${mode}-panel-button`}
                        direction="left"
                        onClick={() => {
                          const isActive =
                            activeBottomPanel === "result" &&
                            resultViewMode === mode
                          void trackEvent(ConsoleEvent.PANEL_BOTTOM_SWITCH, {
                            panel: isActive ? "zeroState" : mode,
                          })
                          dispatch(
                            actions.console.setActiveBottomPanel(
                              isActive ? "zeroState" : "result",
                            ),
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
                    aria-disabled={consoleConfig.readOnly}
                    {...(!consoleConfig.readOnly && {
                      onClick: () => {
                        const isActive = activeBottomPanel === "import"
                        void trackEvent(ConsoleEvent.PANEL_BOTTOM_SWITCH, {
                          panel: isActive ? "zeroState" : "import",
                        })
                        dispatch(
                          actions.console.setActiveBottomPanel(
                            isActive ? "zeroState" : "import",
                          ),
                        )
                      },
                    })}
                    selected={
                      !consoleConfig.readOnly && activeBottomPanel === "import"
                    }
                    aria-label="Import CSV"
                    data-hook="import-panel-button"
                  >
                    <ImportIcon size={SIDEBAR_ICON_SIZE} />
                  </PrimaryToggleButton>
                </Tooltip>
              </Sidebar>
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
                          isDataSourcesPanelOpen ||
                          isTabsPanelOpen ||
                          isSearchPanelOpen
                        }
                        minSize={320}
                        priority={LayoutPriority.Low}
                      >
                        <Wrapper>
                          <Schema open={isDataSourcesPanelOpen} />
                          <TabsPanel open={isTabsPanelOpen} />
                          <SearchPanel
                            ref={searchPanelRef}
                            open={isSearchPanelOpen}
                          />
                        </Wrapper>
                      </Allotment.Pane>
                      <Allotment.Pane priority={LayoutPriority.High}>
                        <Editor />
                      </Allotment.Pane>
                    </Allotment>
                  </Top>
                </Allotment.Pane>

                <Allotment.Pane
                  minSize={0}
                  visible={
                    activeBottomPanel !== "zeroState" &&
                    !(hideResult && activeBottomPanel === "result")
                  }
                >
                  <Bottom>
                    <Tab ref={resultRef}>
                      {result && (
                        <Result
                          viewMode={resultViewMode}
                          canRerun={activeBufferSummary.canRerunResult}
                        />
                      )}
                    </Tab>
                    <Tab ref={importRef}>
                      <Import />
                    </Tab>
                  </Bottom>
                </Allotment.Pane>
              </Allotment>
            </ContentArea>
          </MainContent>
          <AIStatusIndicator />
        </Allotment.Pane>
        <Allotment.Pane
          minSize={470}
          preferredSize={aiChatPanelWidth}
          visible={!!activeSidebar}
          priority={LayoutPriority.Low}
        >
          <SidePanelRight id="side-panel-right" />
        </Allotment.Pane>
      </Allotment>
    </Root>
  )
}

export default Console
