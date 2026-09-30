import { useCallback, useEffect, useState } from "react"
import { toast } from "../../../../components/Toast"
import { eventBus } from "../../../../modules/EventBus"
import type { EventType } from "../../../../modules/EventBus/types"
import type { SettingsDrawerSessionStore } from "./settingsDrawerSessionStore"
import type { SettingsDrawerRequest } from "./settingsDrawerSessions"
import type { SettingsDismissMethod } from "./SettingsDrawerShell"

type Session<Config, Draft> = {
  configAtOpen: Config | undefined
  draft: Draft | null
}

type Options<Config, Draft> = {
  sessions: SettingsDrawerSessionStore<Session<Config, Draft>>
  cellId: string
  config: Config | undefined
  openEvent: EventType
  onOpen: () => void
  onCancel: (method: SettingsDismissMethod) => void
  // Shown when the saved config changed under an open drawer, which closes.
  changedWhileOpenMessage: string
}

// One drawer lifecycle per cell: open on the toolbar's request, keep the
// draft in the session store across a cell remount, and close when the saved
// config changes from elsewhere.
export const useSettingsDrawerSession = <Config, Draft>({
  sessions,
  cellId,
  config,
  openEvent,
  onOpen,
  onCancel,
  changedWhileOpenMessage,
}: Options<Config, Draft>) => {
  const [restored] = useState(() => sessions.get(cellId) !== undefined)
  const [open, setOpen] = useState(restored)
  const [generation, setGeneration] = useState(0)

  const openDrawer = useCallback(() => {
    onOpen()
    sessions.set(cellId, { configAtOpen: config, draft: null })
    setGeneration((current) => current + 1)
    setOpen(true)
  }, [sessions, cellId, config, onOpen])

  const close = useCallback(() => {
    sessions.clear(cellId)
    setOpen(false)
  }, [sessions, cellId])

  const cancel = useCallback(
    (method: SettingsDismissMethod) => {
      onCancel(method)
      close()
    },
    [onCancel, close],
  )

  const keepDraft = useCallback(
    (draft: Draft) => sessions.update(cellId, { draft }),
    [sessions, cellId],
  )

  useEffect(() => {
    if (!open) return
    const session = sessions.get(cellId)
    if (session && session.configAtOpen !== config) {
      close()
      toast.info(changedWhileOpenMessage)
    }
  }, [sessions, cellId, open, config, close, changedWhileOpenMessage])

  useEffect(() => {
    const respond = (payload?: SettingsDrawerRequest) => {
      if (payload?.cellId !== cellId) return
      if (!open) openDrawer()
      else if (payload.mode === "toggle") cancel("button")
    }
    eventBus.subscribe(openEvent, respond)
    return () => eventBus.unsubscribe(openEvent, respond)
  }, [openEvent, cellId, open, openDrawer, cancel])

  return {
    open,
    // True when this mount continues a session, so the drawer appears in
    // place until the next open slides it in again.
    appearInPlace: restored && generation === 0,
    generation,
    initialDraft: sessions.get(cellId)?.draft ?? null,
    openDrawer,
    close,
    cancel,
    keepDraft,
  }
}
