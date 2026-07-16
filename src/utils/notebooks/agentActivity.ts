export type AgentEdit = { bufferId: number; cellId?: string }

type Listener = (edit: AgentEdit) => void

const listeners = new Set<Listener>()

export const emitAgentEdit = (edit: AgentEdit): void => {
  for (const cb of Array.from(listeners)) {
    try {
      cb(edit)
    } catch (err) {
      // One bad subscriber must not break the others.
      console.warn("agent-edit listener failed", err)
    }
  }
}

export const onAgentEdit = (cb: Listener): (() => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const __resetAgentActivityForTests = (): void => {
  listeners.clear()
}
