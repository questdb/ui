import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  FileCheckStatus,
  type UploadResult,
} from "../../../utils/questdb/types"
import { TableNameCheck, type ProcessedFile } from "./types"
import { AuthRefreshUnavailableError } from "../../../modules/OAuth2/session"

type Queue = {
  files: ProcessedFile[]
  unlistedNames: () => string[]
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
  upload: vi.fn<[Pick<Queue, "onFilesDropped" | "unlistedNames">], void>(),
  queue: vi.fn<[Queue], void>(),
}))

vi.mock("./upload", () => ({
  Upload: (props: Pick<Queue, "onFilesDropped" | "unlistedNames">) => {
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
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
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

// E.g. after a failed SSO renewal, while the user is still signed in.
describe("Import file checks that fail", () => {
  const drop = (name: string) => {
    const { onFilesDropped } = mocks.upload.mock.lastCall![0]
    return act(() => onFilesDropped([csv(name)]))
  }

  it("lists a dropped file whose table name check fails, and lets it be uploaded", async () => {
    act(() => {
      renderer = create(element())
    })
    mocks.quest.checkCSVFile.mockRejectedValueOnce(
      new AuthRefreshUnavailableError(),
    )

    await drop("trades.csv")

    expect(file()).toMatchObject({
      table_name: "trades.csv",
      status: TableNameCheck.FAILED,
      exists: false,
    })
    startUpload()
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "trades.csv" }),
    )
  })

  it("lists a file dropped for an existing table whose schema cannot be read", async () => {
    act(() => {
      renderer = create(element())
    })
    mocks.quest.checkCSVFile.mockResolvedValueOnce({
      status: FileCheckStatus.EXISTS,
    })
    mocks.quest.showColumns.mockRejectedValueOnce(
      new AuthRefreshUnavailableError(),
    )

    await drop("trades.csv")

    expect(file()).toMatchObject({
      table_name: "trades.csv",
      status: FileCheckStatus.EXISTS,
      schema: [],
    })
  })

  it("keeps the status of a file whose visibility check fails, and merges the others", async () => {
    await mountWithFile()
    mocks.quest.checkCSVFile.mockResolvedValueOnce({
      status: FileCheckStatus.DOES_NOT_EXIST,
    })
    await act(() => queue().onFilesDropped([csv("quotes.csv")]))
    mocks.quest.checkCSVFile
      .mockRejectedValueOnce(new AuthRefreshUnavailableError())
      .mockResolvedValueOnce({ status: FileCheckStatus.EXISTS })

    mocks.visible = true
    await act(async () => {
      renderer!.update(element())
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(
      queue().files.map(({ table_name, status }) => [table_name, status]),
    ).toEqual([
      ["trades.csv", FileCheckStatus.DOES_NOT_EXIST],
      ["quotes.csv", FileCheckStatus.EXISTS],
    ])
  })
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

  it("shows no status for a new name until its check returns, and uploads under it after", async () => {
    await mountWithFile()
    const check = deferred<{ status: string }>()
    mocks.quest.checkCSVFile.mockReturnValueOnce(check.promise)
    act(() => {
      void queue().onFilePropertyChange(file().id, { table_name: "renamed" })
    })
    // trades.csv did not exist, which says nothing about "renamed"
    expect(file()).toMatchObject({
      table_name: "renamed",
      status: TableNameCheck.PENDING,
    })

    // An upload cannot skip the warning the check may still show
    startUpload()
    expect(mocks.quest.uploadCSVFile).not.toHaveBeenCalled()

    check.resolve({ status: FileCheckStatus.EXISTS })
    await settle(check)
    expect(file()).toMatchObject({
      table_name: "renamed",
      status: FileCheckStatus.EXISTS,
    })

    startUpload()
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "renamed" }),
    )
  })

  it("reports a failed check of a new name instead of keeping the old status", async () => {
    await mountWithFile()
    mocks.quest.checkCSVFile.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    )

    await act(() =>
      queue().onFilePropertyChange(file().id, { table_name: "renamed" }),
    )

    expect(file()).toMatchObject({
      table_name: "renamed",
      status: TableNameCheck.FAILED,
    })
    // The user is warned, and may still upload
    startUpload()
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "renamed" }),
    )
  })

  it("keeps the status another check found when the rename's own check fails", async () => {
    await mountWithFile()
    const renameCheck = deferred<{ status: string }>()
    mocks.quest.checkCSVFile.mockReturnValueOnce(renameCheck.promise)
    let renamed!: Promise<void>
    act(() => {
      renamed = queue().onFilePropertyChange(file().id, {
        table_name: "renamed",
      })
    })
    // The Import view becomes visible and checks the new name, too
    const visibilityCheck = showWithPendingCheck()
    visibilityCheck.resolve({ status: FileCheckStatus.EXISTS })
    await settle(visibilityCheck)
    expect(file().status).toBe(FileCheckStatus.EXISTS)

    renameCheck.reject(new TypeError("Failed to fetch"))
    await act(() => renamed)

    expect(file()).toMatchObject({
      table_name: "renamed",
      status: FileCheckStatus.EXISTS,
    })
  })

  it("counts dropped files as queued until they are listed, also once the list is shown", async () => {
    // Given two drops on the upload view whose table name checks are pending
    act(() => {
      renderer = create(element())
    })
    const tradesCheck = deferred<{ status: string }>()
    const quotesCheck = deferred<{ status: string }>()
    mocks.quest.checkCSVFile
      .mockReturnValueOnce(tradesCheck.promise)
      .mockReturnValueOnce(quotesCheck.promise)
    const { onFilesDropped, unlistedNames } = mocks.upload.mock.lastCall![0]
    let quotesDrop!: Promise<void>
    act(() => {
      void onFilesDropped([csv("trades.csv")])
      quotesDrop = onFilesDropped([csv("quotes.csv")])
    })
    expect(unlistedNames()).toEqual(["trades.csv", "quotes.csv"])

    // When the first check answers, and the list replaces the upload view
    tradesCheck.resolve({ status: FileCheckStatus.DOES_NOT_EXIST })
    await settle(tradesCheck)

    // Then the file still being checked counts as queued in the list's drop box
    expect(queue().files.map(({ table_name }) => table_name)).toEqual([
      "trades.csv",
    ])
    expect(queue().unlistedNames()).toEqual(["quotes.csv"])

    // And no longer once it is listed
    quotesCheck.resolve({ status: FileCheckStatus.DOES_NOT_EXIST })
    await act(() => quotesDrop)
    expect(queue().files.map(({ table_name }) => table_name)).toEqual([
      "trades.csv",
      "quotes.csv",
    ])
    expect(queue().unlistedNames()).toEqual([])
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
