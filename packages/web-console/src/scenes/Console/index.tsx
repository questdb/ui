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
import { Database2, Grid, PieChart, Upload2 } from "@styled-icons/remix-line"
import { ResultViewMode } from "./types"
import { BUTTON_ICON_SIZE } from "../../consts"
import { PrimaryToggleButton } from "../../components"
import { Import } from "./import"
import { BottomPanel } from "../../store/Console/types"
import { Allotment, AllotmentHandle } from "allotment"
import { Import as ImportIcon } from "../../components/icons/import"
import { useSettings } from "../../providers"
import { Box, Loader } from "@questdb/react-components"

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

const Loading = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.color.backgroundLighter};
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
  const [savedEditorSplitterBasis, setSavedEditorSplitterBasis] = useState(
    editorSplitterBasis !== 0 ? editorSplitterBasis : 300,
  )
  const result = useSelector(selectors.query.getResult)
  const running = useSelector(selectors.query.getRunning)
  const activeBottomPanel = useSelector(selectors.console.getActiveBottomPanel)
  const { consoleConfig } = useSettings()
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
                  placement="bottom"
                  trigger={
                    <Navigation
                      data-hook="tables-panel-button"
                      direction="left"
                      onClick={() => {
                        dispatch(
                          actions.console.setActiveTopPanel(
                            editorSplitterBasis === 0 ? "tables" : undefined,
                          ),
                        )
                        updateSettings(
                          StoreKey.EDITOR_SPLITTER_BASIS,
                          editorSplitterBasis === 0
                            ? savedEditorSplitterBasis
                            : 0,
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
            <Allotment
              ref={horizontalSplitterRef}
              onDragEnd={(sizes) => {
                if (sizes[0] !== 0) {
                  setSavedEditorSplitterBasis(sizes[0])
                }
                updateSettings(StoreKey.EDITOR_SPLITTER_BASIS, sizes[0])
              }}
              snap
            >
              <Allotment.Pane
                preferredSize={editorSplitterBasis}
                visible={editorSplitterBasis !== 0 && !sm}
              >
                <Schema />
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
              <PopperHover
                placement="right"
                trigger={
                  <PrimaryToggleButton
                    readOnly={consoleConfig.readOnly}
                    {...(!consoleConfig.readOnly && {
                      onClick: () => {
                        dispatch(actions.console.setActiveBottomPanel("import"))
                      },
                    })}
                    selected={activeBottomPanel === "import"}
                    data-hook="import-panel-button"
                  >
                    <ImportIcon size={BUTTON_ICON_SIZE} />
                  </PrimaryToggleButton>
                }
              >
                <Tooltip>
                  {consoleConfig.readOnly
                    ? "To use this feature, turn off read-only mode in the configuration file"
                    : "Import files from CSV"}
                </Tooltip>
              </PopperHover>
            </Sidebar>
            <Tab ref={resultRef}>
              {result && !running.value && <Result viewMode={resultViewMode} />}
              {running.value && (
                <Loading>
                  Loading results <Loader />
                </Loading>
              )}
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
    </Root>
  )
}

export default Console
