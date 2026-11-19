import { useCallback, useRef } from "react"
import { useSelector } from "react-redux"
import { useEditor } from "../providers/EditorProvider"
import { selectors } from "../store"
import { RunningType } from "../store/Query/types"

// Whether the SQL editor holds work that switching away from it would abort:
// a script (it owns the tabs) or a single query, refresh or explain in flight.
// Activating a notebook unmounts the editor, and its unmount cleanup aborts the
// statement in flight. The getter reads the latest state, so async flows can
// check it right before they switch tabs, seconds after the user's click.
export const useEditorBusy = (): (() => boolean) => {
  const { tabsDisabled } = useEditor()
  const running = useSelector(selectors.query.getRunning)
  const busy = useRef(false)
  busy.current = tabsDisabled || running !== RunningType.NONE
  return useCallback(() => busy.current, [])
}
