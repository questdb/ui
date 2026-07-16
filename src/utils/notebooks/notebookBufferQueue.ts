// Per-buffer FIFO task queue. Serializes agent read-modify-write cycles on a
// notebook buffer against each other and against the mount seed read, so every
// task observes all prior committed writes.

type QueueEntry = {
  tail: Promise<unknown>
  depth: number
}

const queues = new Map<number, QueueEntry>()

export const enqueueBufferTask = <T>(
  bufferId: number,
  task: () => Promise<T> | T,
): Promise<T> => {
  const entry = queues.get(bufferId) ?? { tail: Promise.resolve(), depth: 0 }
  const result = entry.tail.then(task)
  // A failed task must not wedge the queue: the stored tail swallows the
  // rejection while callers still receive it through `result`.
  entry.tail = result.catch(() => undefined)
  entry.depth += 1
  queues.set(bufferId, entry)

  const settle = () => {
    const current = queues.get(bufferId)
    if (!current) return
    current.depth -= 1
    if (current.depth === 0) queues.delete(bufferId)
  }
  void result.then(settle, settle)

  return result
}

export const bufferQueueDepth = (bufferId: number): number =>
  queues.get(bufferId)?.depth ?? 0

export const __resetNotebookBufferQueuesForTests = (): void => {
  queues.clear()
}
