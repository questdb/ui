import React from "react"
import styled from "styled-components"
import { Splitter, useScreenSize } from "../../components"
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
import { Sidebar } from "../../components/Sidebar"
import { color } from "../../utils"

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

const Logo = styled.div`
  position: relative;
  display: flex;
  width: 4rem;
  height: 4rem;
  background: ${color("black")};
  z-index: 1;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`

const Console = () => {
  const { sm } = useScreenSize()
  const { editorSplitterBasis, resultsSplitterBasis, updateSettings } =
    useLocalStorage()
  const result = useSelector(selectors.query.getResult)
  const dispatch = useDispatch()

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
              <Logo
                onClick={() =>
                  dispatch(actions.console.setActivePanel("console"))
                }
              >
                <img alt="QuestDB Logo" height="26" src="/assets/favicon.svg" />
              </Logo>
              top
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
            <Sidebar>bottom</Sidebar>
            {result ? <Result /> : <ZeroState />}
          </Bottom>
        </Splitter>
      </EditorProvider>
    </Root>
  )
}

export default Console
