type Listener = () => void

const listeners = new Set<Listener>()

export const emitLocalAgentPairedViaLink = (): void => {
  for (const listener of Array.from(listeners)) listener()
}

export const onLocalAgentPairedViaLink = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
