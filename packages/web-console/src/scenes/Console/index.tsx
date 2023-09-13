import React from "react"
import styled from "styled-components"
import { Splitter, useScreenSize } from "../../components"
import Editor from "../Editor"
import Notifications from "../Notifications"
import Result from "../Result"
import Schema from "../Schema"
import { ZeroState } from "../Result/zero-state"
import { EditorProvider } from "../../providers"
import { useCallback } from "react"
import { BusEvent } from "../../consts"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { useSelector } from "react-redux"
import { selectors } from "../../store"

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

const Console = () => {
  const { sm } = useScreenSize()
  const { editorSplitterBasis, resultsSplitterBasis, updateSettings } =
    useLocalStorage()
  const result = useSelector(selectors.query.getResult)

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
          {result ? <Result /> : <ZeroState />}
        </Splitter>
        <Notifications />
      </EditorProvider>
    </Root>
  )
}

export default Console
