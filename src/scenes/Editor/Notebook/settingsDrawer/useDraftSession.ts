import { useLayoutEffect, useMemo, useRef, useState } from "react"

/**
 * An async step's claim on a drawer: the session it started in and the
 * draft revision it started from.
 */
export type DraftTicket = {
  readonly session: number
  readonly revision: number
}

type Options<Config, Live> = {
  open: boolean
  // The saved settings the drawer edits, if a change to them while open
  // ends the session: the owner closes the drawer (useSettingsDrawerSession).
  config?: Config
  sameConfig?: (a: Config, b: Config) => boolean
  // What a step checks: the draft and the notebook state it is checked
  // against. A change after `begin` makes the ticket stale.
  inputs: readonly unknown[]
  // What a save reads when it writes.
  live: Live
}

export type DraftSession<Live> = {
  // True while a step of this session waits; cleared by its own completion
  // or when the session ends.
  busy: boolean
  isBusy: () => boolean
  begin: () => DraftTicket
  // The session that started the step is still open.
  isLive: (ticket: DraftTicket) => boolean
  // ...and its draft has not changed since.
  isCurrent: (ticket: DraftTicket) => boolean
  // Waits on a step, busy meanwhile.
  wait: <T>(ticket: DraftTicket, step: Promise<T>) => Promise<T>
  // The live values as of the last commit, read at write time.
  read: () => Live
}

type State<Config, Live> = {
  session: number
  alive: boolean
  revision: number
  waiting: number
  open: boolean
  config: Config | undefined
  inputs: readonly unknown[]
  live: Live
}

const sameInputs = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

/**
 * One drawer session per open, and one draft revision per edit, for saves
 * that wait (a database check, a module load). A completion goes on only in
 * the session that started it; one whose draft changed meanwhile starts
 * again with the current draft; a save reads what it writes when it writes.
 * Closing, cancelling, reopening, unmounting, or the saved settings changing
 * under the drawer end the session.
 */
export const useDraftSession = <Config, Live>({
  open,
  config,
  sameConfig,
  inputs,
  live,
}: Options<Config, Live>): DraftSession<Live> => {
  const ref = useRef<State<Config, Live>>({
    session: 0,
    alive: false,
    revision: 0,
    waiting: 0,
    open,
    config,
    inputs,
    live,
  })
  const [busy, setBusy] = useState(false)

  // Layout effects run with the commit, before any completion can read the
  // state: what a completion sees is what the drawer shows.
  useLayoutEffect(() => {
    const state = ref.current
    const end = () => {
      state.session++
      state.waiting = 0
      setBusy(false)
    }
    if (open !== state.open) {
      end()
      state.alive = open
    } else if (
      state.alive &&
      sameConfig &&
      !sameConfig(state.config as Config, config as Config)
    ) {
      end()
      state.alive = false
    }
    if (!sameInputs(state.inputs, inputs)) state.revision++
    state.open = open
    state.config = config
    state.inputs = inputs
    state.live = live
  })

  useLayoutEffect(() => {
    const state = ref.current
    state.alive = state.open
    return () => {
      state.session++
      state.alive = false
      state.waiting = 0
    }
  }, [])

  const methods = useMemo(() => {
    const state = ref.current
    const isLive = (ticket: DraftTicket) =>
      state.alive && ticket.session === state.session
    return {
      isBusy: () => state.waiting > 0,
      begin: (): DraftTicket => ({
        session: state.session,
        revision: state.revision,
      }),
      isLive,
      isCurrent: (ticket: DraftTicket) =>
        isLive(ticket) && ticket.revision === state.revision,
      wait: async <T>(ticket: DraftTicket, step: Promise<T>): Promise<T> => {
        if (!isLive(ticket)) return step
        state.waiting++
        setBusy(true)
        try {
          return await step
        } finally {
          if (isLive(ticket)) {
            state.waiting--
            if (state.waiting === 0) setBusy(false)
          }
        }
      },
      read: () => state.live,
    }
  }, [])

  return useMemo(() => ({ ...methods, busy }), [methods, busy])
}
