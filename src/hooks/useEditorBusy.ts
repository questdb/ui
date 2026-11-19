import { useCallback } from "react"
import { useStore } from "react-redux"
import { useEditor } from "../providers/EditorProvider"
import { selectors } from "../store"
import { RunningType } from "../store/Query/types"
import type { StoreShape } from "../store/types"

// Whether the SQL editor holds work that switching away from it would abort:
// a script (it owns the tabs) or a single query, refresh or explain in flight.
// Activating a notebook unmounts the editor, and its unmount cleanup aborts the
// statement in flight. The getter reads live state, not the last render, so
// async flows can check it right before they switch tabs, seconds after the
// user's click, even if the component that started them has unmounted.
export const useEditorBusy = (): (() => boolean) => {
  const { isTabsDisabled } = useEditor()
  const store = useStore<StoreShape>()
  return useCallback(
    () =>
      isTabsDisabled() ||
      selectors.query.getRunning(store.getState()) !== RunningType.NONE,
    [isTabsDisabled, store],
  )
}
