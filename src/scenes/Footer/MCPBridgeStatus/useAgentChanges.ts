import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "../../../components/Toast"
import { useEditor } from "../../../providers/EditorProvider"
import { getWorkspace } from "../../../utils/notebooks/notebookAIBridge"
import {
  onAgentEdit,
  type AgentEdit,
} from "../../../utils/notebooks/agentActivity"

const POPPER_AUTOHIDE_MS = 10_000

export type AgentChanges = {
  hasUnseen: boolean
  showPopper: boolean
  unread: boolean
  label: string
  view: () => Promise<void>
  dismiss: () => void
  markPopoverOpened: () => void
  setAutoHidePaused: (paused: boolean) => void
}

export const useAgentChanges = (): AgentChanges => {
  const { activeBuffer, buffers } = useEditor()
  const [latest, setLatest] = useState<AgentEdit | null>(null)
  const [popperVisible, setPopperVisible] = useState(false)
  const [autoHidePaused, setAutoHidePaused] = useState(false)
  const [unacknowledged, setUnacknowledged] = useState(false)
  const dismissedRef = useRef(false)

  const activeId = typeof activeBuffer.id === "number" ? activeBuffer.id : null
  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const latestRef = useRef(latest)
  useEffect(() => {
    latestRef.current = latest
  }, [latest])

  useEffect(
    () =>
      onAgentEdit((edit) => {
        if (edit.bufferId === activeIdRef.current) return
        setLatest(edit)
        setUnacknowledged(true)
        if (!dismissedRef.current) setPopperVisible(true)
      }),
    [],
  )

  // Also catches an edit that raced tab activation past the subscription's
  // ref guard — the invariant is derived, not event-time-only.
  useEffect(() => {
    if (latest && latest.bufferId === activeId) setLatest(null)
  }, [activeId, latest])

  useEffect(() => {
    if (!popperVisible || autoHidePaused) return
    const timer = window.setTimeout(
      () => setPopperVisible(false),
      POPPER_AUTOHIDE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [popperVisible, autoHidePaused, latest])

  const hasUnseen = latest !== null && latest.bufferId !== activeId
  const showPopper = hasUnseen && popperVisible
  const unread = hasUnseen && unacknowledged
  const label =
    latest !== null
      ? (buffers.find((b) => b.id === latest.bufferId)?.label ??
        `#${latest.bufferId}`)
      : ""

  const view = useCallback(async () => {
    if (!latest) return
    const workspace = getWorkspace()
    if (!workspace) {
      toast.error("The notebook workspace isn't ready yet. Try again shortly.")
      return
    }
    const activated = await workspace.activateNotebook(
      latest.bufferId,
      latest.cellId,
    )
    if (!activated) {
      toast.error("Could not open the notebook. It may have been deleted.")
    }
    // An edit that landed during the await is a new notification — keep it.
    if (latestRef.current !== latest) return
    setLatest(null)
    setPopperVisible(false)
    setUnacknowledged(false)
    setAutoHidePaused(false)
  }, [latest])

  const dismiss = useCallback(() => {
    dismissedRef.current = true
    setPopperVisible(false)
    setAutoHidePaused(false)
  }, [])

  const markPopoverOpened = useCallback(() => {
    setUnacknowledged(false)
    setPopperVisible(false)
    setAutoHidePaused(false)
  }, [])

  return useMemo(
    () => ({
      hasUnseen,
      showPopper,
      unread,
      label,
      view,
      dismiss,
      markPopoverOpened,
      setAutoHidePaused,
    }),
    [
      hasUnseen,
      showPopper,
      unread,
      label,
      view,
      dismiss,
      markPopoverOpened,
      setAutoHidePaused,
    ],
  )
}
