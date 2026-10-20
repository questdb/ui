import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  FileCheckStatus,
  type UploadResult,
} from "../../../utils/questdb/types"
import type { ProcessedFile } from "./types"

type Queue = {
  files: ProcessedFile[]
  onFilesDropped: (files: File[]) => Promise<void>
  onFileUpload: (id: string) => Promise<void>
  onFilePropertyChange: (
    id: string,
    file: Partial<ProcessedFile>,
  ) => Promise<void>
}

const mocks = vi.hoisted(() => ({
  visible: false,
  quest: {
    checkCSVFile: vi.fn(),
    uploadCSVFile: vi.fn(),
    query: vi.fn(),
    showColumns: vi.fn(),
  },
  upload: vi.fn<[Pick<Queue, "onFilesDropped">], void>(),
  queue: vi.fn<[Queue], void>(),
}))

vi.mock("./upload", () => ({
  Upload: (props: Pick<Queue, "onFilesDropped">) => {
    mocks.upload(props)
    return null
  },
}))
vi.mock("./files-to-upload", () => ({
  FilesToUpload: (props: Queue) => {
    mocks.queue(props)
    return null
  },
}))
vi.mock("../../../providers", async () => {
  const { createContext } =
    await vi.importActual<typeof import("react")>("react")
  return { QuestContext: createContext({ quest: mocks.quest }) }
})
vi.mock("react-redux", () => ({ useSelector: () => [] }))
vi.mock("../../../store", () => ({
  selectors: { query: { getTables: () => [] } },
}))
vi.mock("../../../components", () => ({ Box: "div" }))
vi.mock("../../../hooks", () => ({ useIsVisible: () => mocks.visible }))
// OSS: no table owner lookup
vi.mock("../../../utils/localStorage", () => ({ getValue: () => "" }))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

import { ImportCSVFiles } from "."

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const csv = (name: string) => ({ name, size: 7 }) as unknown as File
const element = () => <ImportCSVFiles onViewData={vi.fn()} onUpload={vi.fn()} />
const queue = () => mocks.queue.mock.lastCall![0]
const file = (index = 0) => queue().files[index]
const settle = (check: { promise: Promise<unknown> }) =>
  act(async () => {
    await check.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

let renderer: ReactTestRenderer | undefined

// Drops trades.csv, whose first check finds no table.
const mountWithFile = async () => {
  act(() => {
    renderer = create(element())
  })
  mocks.quest.checkCSVFile.mockResolvedValueOnce({
    status: FileCheckStatus.DOES_NOT_EXIST,
  })
  const { onFilesDropped } = mocks.upload.mock.lastCall![0]
  await act(() => onFilesDropped([csv("trades.csv")]))
  expect(file()).toMatchObject({
    table_name: "trades.csv",
    status: FileCheckStatus.DOES_NOT_EXIST,
  })
}

// The Import view becomes visible, and its status check waits for a refresh.
const showWithPendingCheck = () => {
  const check = deferred<{ status: string }>()
  mocks.quest.checkCSVFile.mockReturnValueOnce(check.promise)
  mocks.visible = true
  act(() => renderer!.update(element()))
  return check
}

const startUpload = () => {
  mocks.quest.uploadCSVFile.mockReturnValueOnce(
    deferred<UploadResult>().promise,
  )
  act(() => {
    void queue().onFileUpload(file().id)
  })
}

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  mocks.visible = false
  vi.resetAllMocks()
})

// A status check can wait up to ten seconds for a token refresh.
describe("Import file checks that finish after other changes", () => {
  it("keeps an upload running when the visibility check returns during it", async () => {
    await mountWithFile()
    const check = showWithPendingCheck()
    startUpload()
    expect(file().isUploading).toBe(true)

    check.resolve({ status: FileCheckStatus.EXISTS })
    await settle(check)

    // Only the status is merged: the upload is not reported as stopped
    expect(file()).toMatchObject({
      isUploading: true,
      status: FileCheckStatus.EXISTS,
    })
    // and a second click does not start another import
    act(() => {
      void queue().onFileUpload(file().id)
    })
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledOnce()
  })

  it("keeps a file dropped while the visibility check is pending", async () => {
    await mountWithFile()
    const check = showWithPendingCheck()
    mocks.quest.checkCSVFile.mockResolvedValueOnce({
      status: FileCheckStatus.DOES_NOT_EXIST,
    })
    await act(() => queue().onFilesDropped([csv("quotes.csv")]))

    check.resolve({ status: FileCheckStatus.EXISTS })
    await settle(check)

    expect(queue().files.map(({ table_name }) => table_name)).toEqual([
      "trades.csv",
      "quotes.csv",
    ])
    expect(file().status).toBe(FileCheckStatus.EXISTS)
  })

  it("uploads under a new name at once and keeps the upload when its check returns", async () => {
    await mountWithFile()
    const check = deferred<{ status: string }>()
    mocks.quest.checkCSVFile.mockReturnValueOnce(check.promise)
    act(() => {
      void queue().onFilePropertyChange(file().id, { table_name: "renamed" })
    })
    expect(file().table_name).toBe("renamed")

    startUpload()
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "renamed" }),
    )

    check.resolve({ status: FileCheckStatus.EXISTS })
    await settle(check)

    expect(file()).toMatchObject({
      table_name: "renamed",
      isUploading: true,
      status: FileCheckStatus.EXISTS,
    })
  })

  it("ignores the check of a name that was changed again", async () => {
    await mountWithFile()
    const first = deferred<{ status: string }>()
    const second = deferred<{ status: string }>()
    mocks.quest.checkCSVFile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    act(() => {
      void queue().onFilePropertyChange(file().id, { table_name: "first" })
    })
    act(() => {
      void queue().onFilePropertyChange(file().id, { table_name: "second" })
    })

    second.resolve({ status: FileCheckStatus.EXISTS })
    await settle(second)
    first.resolve({ status: FileCheckStatus.RESERVED_NAME })
    await settle(first)

    expect(file()).toMatchObject({
      table_name: "second",
      status: FileCheckStatus.EXISTS,
    })
  })
})
