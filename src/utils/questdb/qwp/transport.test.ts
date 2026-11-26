import { describe, expect, it, vi } from "vitest"
import {
  QWP_COLUMN_TYPE,
  QWP_EGRESS_CAPABILITY,
  QWP_STATUS,
  QwpEgressQueryError,
  QwpEgressSessionClosedError,
  type QwpEgressSession,
  type QwpQueryCompletion,
  type QwpResultBatch,
} from "@questdb/browser-client"
import {
  QwpConnectionLostError,
  QwpQueryFailure,
  QwpTransport,
  type QwpQueryRequest,
} from "./transport"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => undefined)
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

type FakeQuery = {
  batches?: QwpResultBatch[]
  completion: Promise<QwpQueryCompletion>
  cancel?: () => Promise<void>
}

const egressQuery = ({ batches = [], completion, cancel }: FakeQuery) => {
  const cancelMock = vi.fn(cancel ?? (() => Promise.resolve()))
  return {
    completion,
    cancel: cancelMock,
    cancelMock,
    async *[Symbol.asyncIterator]() {
      for (const batch of batches) yield batch
      await completion
    },
  }
}

const resultEnd = (rowCount?: number, totalRows = 0): QwpQueryCompletion =>
  ({
    kind: "result-end",
    totalRows: BigInt(totalRows),
    rowCount: rowCount === undefined ? undefined : BigInt(rowCount),
  }) as QwpQueryCompletion

const batch = (values: number[]) =>
  ({
    rowCount: values.length,
    columns: [{ name: "x", type: QWP_COLUMN_TYPE.INT, values }],
  }) as unknown as QwpResultBatch

type Session = QwpEgressSession & {
  queryMock: ReturnType<typeof vi.fn>
  wasClosed: () => boolean
}

const fakeSession = (
  queries: Array<() => Promise<unknown>>,
  capabilities: number = QWP_EGRESS_CAPABILITY.QUERY_DETAILS,
): Session => {
  const closed = deferred<void>()
  let isClosed = false
  const queryMock = vi.fn(() => {
    const next = queries.shift()
    return next ? next() : Promise.reject(new Error("no query"))
  })
  return {
    serverInfo: { capabilities },
    closed: closed.promise,
    close: () => {
      isClosed = true
      closed.resolve()
      return Promise.resolve()
    },
    query: queryMock,
    queryMock,
    wasClosed: () => isClosed,
  } as unknown as Session
}

const request = (
  overrides: Partial<QwpQueryRequest> = {},
): QwpQueryRequest => ({
  sql: "select x",
  window: { skipRows: 0, maxRows: 1000 },
  countRows: true,
  signal: new AbortController().signal,
  onSend: () => undefined,
  ...overrides,
})

// A transport whose first request has opened a working connection.
const readyTransport = async (session: Session) => {
  const connect = vi.fn(() => Promise.resolve(session as QwpEgressSession))
  const transport = new QwpTransport(connect)
  await expect(transport.execute(request())).resolves.toEqual({
    kind: "unavailable",
    reopenSession: false,
  })
  await flush()
  return { transport, connect }
}

describe("QwpTransport", () => {
  it("serves requests over HTTP until a connection has opened", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({
            batches: [batch([1, 2])],
            completion: Promise.resolve(resultEnd(5, 2)),
          }),
        ),
    ])
    const { transport, connect } = await readyTransport(session)

    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "result",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1], [2]],
      rowCount: 5,
    })
    expect(connect).toHaveBeenCalledTimes(1)
    expect(session.queryMock).toHaveBeenCalledWith("select x", {
      errorPosition: true,
      stats: true,
      countRows: true,
      skipRows: 0,
      maxRows: 1000,
    })
  })

  it("counts the rows it stepped through without a row count", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({
            batches: [batch([3, 4])],
            completion: Promise.resolve(resultEnd(undefined, 2)),
          }),
        ),
    ])
    const { transport } = await readyTransport(session)

    await expect(
      transport.execute(
        request({ window: { skipRows: 2, maxRows: 2 }, countRows: false }),
      ),
    ).resolves.toMatchObject({ kind: "result", rowCount: 4 })
  })

  it("reports a statement's operation", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({
            completion: Promise.resolve({
              kind: "exec-done",
              operationType: 9,
              rowsAffected: BigInt(0),
            } as QwpQueryCompletion),
          }),
        ),
    ])
    const { transport } = await readyTransport(session)

    await expect(transport.execute(request())).resolves.toEqual({
      kind: "statement",
      operationType: 9,
      stats: undefined,
    })
  })

  it("rejects with the server's error and its position", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({
            completion: Promise.reject(
              new QwpEgressQueryError(
                BigInt(1),
                QWP_STATUS.PARSE_ERROR,
                "Invalid column: foo",
                7,
              ),
            ),
          }),
        ),
    ])
    const { transport } = await readyTransport(session)

    const failure = await transport.execute(request()).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(QwpQueryFailure)
    expect(failure).toMatchObject({
      status: QWP_STATUS.PARSE_ERROR,
      message: "Invalid column: foo",
      position: 7,
    })
  })

  it("leaves a result QWP cannot carry to HTTP", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({
            completion: Promise.reject(
              new QwpEgressQueryError(
                BigInt(1),
                QWP_STATUS.INTERNAL_ERROR,
                "QWP egress: unsupported column type INTERVAL",
              ),
            ),
          }),
        ),
      () =>
        Promise.resolve(
          egressQuery({ completion: Promise.resolve(resultEnd(0)) }),
        ),
    ])
    const { transport, connect } = await readyTransport(session)

    await expect(transport.execute(request())).resolves.toEqual({
      kind: "unavailable",
      reopenSession: false,
    })
    await flush()
    // The session stays in use.
    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "result",
    })
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("releases an aborted request at once and cancels its query", async () => {
    const completion = deferred<QwpQueryCompletion>()
    const query = egressQuery({ completion: completion.promise })
    const session = fakeSession([
      () => Promise.resolve(query),
      () =>
        Promise.resolve(
          egressQuery({ completion: Promise.resolve(resultEnd(0)) }),
        ),
    ])
    const { transport, connect } = await readyTransport(session)
    const controller = new AbortController()

    const running = transport.execute(request({ signal: controller.signal }))
    await flush()
    controller.abort()

    await expect(running).rejects.toMatchObject({ name: "AbortError" })
    expect(query.cancelMock).toHaveBeenCalled()

    // The session serves the next request once the server has ended the query.
    completion.reject(
      new QwpEgressQueryError(BigInt(0), QWP_STATUS.CANCELLED, "cancelled"),
    )
    await flush()
    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "result",
    })
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("cancels a query aborted while it was being sent", async () => {
    const sent = deferred<ReturnType<typeof egressQuery>>()
    const query = egressQuery({
      completion: deferred<QwpQueryCompletion>().promise,
    })
    const session = fakeSession([() => sent.promise])
    const { transport } = await readyTransport(session)
    const controller = new AbortController()

    const running = transport.execute(request({ signal: controller.signal }))
    await flush()
    controller.abort()
    sent.resolve(query)

    await expect(running).rejects.toMatchObject({ name: "AbortError" })
    expect(query.cancelMock).toHaveBeenCalled()
  })

  it("sends a request again on a new session when its session had closed", async () => {
    const closedSession = fakeSession([
      () => Promise.reject(new QwpEgressSessionClosedError()),
    ])
    const freshSession = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({ completion: Promise.resolve(resultEnd(0)) }),
        ),
    ])
    const sessions = [closedSession, freshSession]
    const transport = new QwpTransport(() =>
      Promise.resolve(sessions.shift() as QwpEgressSession),
    )
    await transport.execute(request())
    await flush()

    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "result",
    })
    expect(closedSession.wasClosed()).toBe(true)
  })

  it("reports a connection lost after sending", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({
            completion: Promise.reject(new QwpEgressSessionClosedError()),
          }),
        ),
    ])
    const { transport } = await readyTransport(session)

    await expect(transport.execute(request())).rejects.toBeInstanceOf(
      QwpConnectionLostError,
    )
  })

  it("lets a failing check before sending release its session", async () => {
    const session = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({ completion: Promise.resolve(resultEnd(0)) }),
        ),
    ])
    const { transport, connect } = await readyTransport(session)
    const ended = new Error("session ended")

    await expect(
      transport.execute(
        request({
          onSend: () => {
            throw ended
          },
        }),
      ),
    ).rejects.toBe(ended)
    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "result",
    })
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("reopens the cookie session over HTTP after a failed connection", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const connect = vi.fn(() => Promise.reject(new Error("upgrade failed")))
    const transport = new QwpTransport(connect)

    await transport.execute(request())
    await flush()
    await expect(transport.execute(request())).resolves.toEqual({
      kind: "unavailable",
      reopenSession: true,
    })
    expect(connect).toHaveBeenCalledTimes(1)

    // HTTP works with a reopened session: QWP may try again.
    transport.noteHttpSuccess()
    await transport.execute(request())
    await flush()
    expect(connect).toHaveBeenCalledTimes(2)

    // Failing again while HTTP works, it is given up.
    transport.noteHttpSuccess()
    await transport.execute(request())
    await flush()
    expect(connect).toHaveBeenCalledTimes(2)
    expect(transport.disabled).toBe(true)
  })

  it("keeps trying while HTTP fails as well", async () => {
    const connect = vi.fn(() => Promise.reject(new Error("refused")))
    const transport = new QwpTransport(connect)

    await transport.execute(request())
    await flush()
    // No HTTP success: the server may be down. Requests reopen the session.
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(transport.execute(request())).resolves.toEqual({
        kind: "unavailable",
        reopenSession: true,
      })
    }
    expect(transport.disabled).toBe(false)
  })

  it("does not use a server without query details", async () => {
    const session = fakeSession([], 0)
    const connect = vi.fn(() => Promise.resolve(session as QwpEgressSession))
    const transport = new QwpTransport(connect)

    await transport.execute(request())
    await flush()

    expect(transport.disabled).toBe(true)
    expect(session.wasClosed()).toBe(true)
    await expect(transport.execute(request())).resolves.toEqual({
      kind: "unavailable",
      reopenSession: false,
    })
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("opens new connections after a reset", async () => {
    const first = fakeSession([])
    const second = fakeSession([
      () =>
        Promise.resolve(
          egressQuery({ completion: Promise.resolve(resultEnd(0)) }),
        ),
    ])
    const sessions = [first, second]
    const connect = vi.fn(() =>
      Promise.resolve(sessions.shift() as QwpEgressSession),
    )
    const transport = new QwpTransport(connect)
    await transport.execute(request())
    await flush()

    transport.reset()
    expect(first.wasClosed()).toBe(true)
    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "unavailable",
    })
    await flush()
    await expect(transport.execute(request())).resolves.toMatchObject({
      kind: "result",
    })
    expect(connect).toHaveBeenCalledTimes(2)
  })
})
