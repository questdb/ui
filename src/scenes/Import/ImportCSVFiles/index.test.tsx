import "../../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FileCheckStatus } from "../../../utils/questdb/types"
import { AuthRefreshUnavailableError } from "../../../modules/OAuth2/session"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"

const mocks = vi.hoisted(() => ({
  visible: false,
  quest: {
    checkCSVFile: vi.fn(),
    uploadCSVFile: vi.fn(),
    showColumns: vi.fn(),
  },
  toastError: vi.fn(),
}))
vi.mock("../../../providers", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext({ quest: mocks.quest }) }
})
vi.mock("react-redux", () => ({ useSelector: () => [] }))
vi.mock("../../../store", () => ({
  selectors: { query: { getTables: vi.fn() } },
}))
vi.mock("../../../hooks", () => ({ useIsVisible: () => mocks.visible }))
vi.mock("../../../components", () => ({ Box: "div" }))
vi.mock("../../../components/Toast", () => ({
  toast: { error: mocks.toastError },
}))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("./files-to-upload", () => ({ FilesToUpload: () => null }))
vi.mock("./upload", () => ({ Upload: () => null }))
import { ImportCSVFiles } from "."
import { FilesToUpload } from "./files-to-upload"
import { Upload } from "./upload"
import type { ProcessedFile } from "./types"

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
let renderer: ReactTestRenderer
const onUpload = vi.fn()
const tree = () => <ImportCSVFiles onUpload={onUpload} onViewData={vi.fn()} />
type FileProps = Omit<
  React.ComponentProps<typeof FilesToUpload>,
  "onFilesDropped" | "onFileUpload" | "onFilePropertyChange"
> & {
  onFilesDropped: (files: File[]) => Promise<void>
  onFileUpload: (id: string) => Promise<void>
  onFilePropertyChange: (
    id: string,
    file: Partial<ProcessedFile>,
  ) => Promise<void>
}
const rows = () => renderer.root.findByType(FilesToUpload).props as FileProps
const check = { status: FileCheckStatus.DOES_NOT_EXIST }

beforeEach(async () => {
  mocks.visible = false
  mocks.quest.checkCSVFile.mockResolvedValue(check)
  localStorage.clear()
  act(() => {
    renderer = create(tree())
  })
  await act(async () => {
    await renderer.root
      .findByType(Upload)
      .props.onFilesDropped([new File(["value\n1\n"], "probe.csv")])
  })
})
afterEach(() => {
  act(() => renderer.unmount())
  authSessionState.endSession()
  vi.resetAllMocks()
})

const uploadResult = {
  status: "OK",
  columns: [],
  rowsImported: 1,
  rowsRejected: 0,
  location: "probe.csv",
  header: true,
}

describe("CSV async status merging", () => {
  it("cannot restore isUploading from a visibility check or launch a duplicate upload", async () => {
    const status = deferred<typeof check>()
    const upload = deferred<typeof uploadResult>()
    mocks.quest.checkCSVFile.mockReturnValueOnce(status.promise)
    mocks.quest.uploadCSVFile.mockReturnValue(upload.promise)
    act(() => {
      mocks.visible = true
      renderer.update(tree())
    })
    const handlers = rows()
    const id = handlers.files[0].id
    let uploading!: Promise<void>
    act(() => {
      uploading = handlers.onFileUpload(id)
      void handlers.onFileUpload(id)
    })
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledOnce()
    await act(async () => {
      status.resolve({ status: FileCheckStatus.EXISTS })
      await status.promise
    })
    expect(rows().files[0].isUploading).toBe(true)
    await act(async () => {
      await rows().onFileUpload(id)
    })
    expect(mocks.quest.uploadCSVFile).toHaveBeenCalledOnce()
    await act(async () => {
      upload.resolve(uploadResult)
      await uploading
    })
    expect(rows().files[0]).toMatchObject({
      uploaded: true,
      isUploading: false,
    })
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it("does not revert renames, settings, removals, or newly dropped rows", async () => {
    const old = deferred<typeof check>()
    mocks.quest.checkCSVFile.mockReturnValueOnce(old.promise)
    const id = rows().files[0].id
    let rename!: Promise<void>
    act(() => {
      rename = rows().onFilePropertyChange(id, { table_name: "old" })
    })
    expect(rows().files[0].table_name).toBe("old")
    await act(async () => {
      await rows().onFilePropertyChange(id, { table_name: "current" })
    })
    const settings = { ...rows().files[0].settings, overwrite: true }
    await act(async () => {
      await rows().onFilePropertyChange(id, { settings })
    })
    await act(async () => {
      await rows().onFilesDropped([new File(["a\n2\n"], "second.csv")])
    })
    await act(async () => {
      old.resolve({ status: FileCheckStatus.EXISTS })
      await rename
    })
    expect(rows().files).toHaveLength(2)
    expect(rows().files[0]).toMatchObject({
      table_name: "current",
      settings,
      status: FileCheckStatus.DOES_NOT_EXIST,
    })
    const late = deferred<typeof check>()
    mocks.quest.checkCSVFile.mockReturnValueOnce(late.promise)
    let removed!: Promise<void>
    act(() => {
      removed = rows().onFilePropertyChange(id, { table_name: "removed" })
      rows().onFileRemove(id)
    })
    await act(async () => {
      late.resolve(check)
      await removed
    })
    expect(rows().files).toHaveLength(1)
    expect(rows().files[0].table_name).toBe("second.csv")
  })

  it("handles rejected checks without losing the current list or leaving an unhandled promise", async () => {
    mocks.quest.checkCSVFile.mockRejectedValueOnce(
      new AuthRefreshUnavailableError(),
    )
    await act(async () => {
      await rows().onFilePropertyChange(rows().files[0].id, {
        table_name: "new-name",
      })
    })
    expect(rows().files[0].table_name).toBe("new-name")
    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining("request was not sent"),
    )
  })
})
