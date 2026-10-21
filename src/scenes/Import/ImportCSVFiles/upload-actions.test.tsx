import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FileCheckStatus } from "../../../utils/questdb/types"
import { TableNameCheck, type ProcessedFile } from "./types"

vi.mock("../../../components", () => ({
  Box: "div",
  Button: "button",
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("../../../components/icons", () => ({
  Close: () => null,
  Upload2: () => null,
}))
vi.mock("./upload-settings-dialog", () => ({
  UploadSettingsDialog: () => null,
}))

import { UploadActions } from "./upload-actions"

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

const uploadButton = (file: Partial<ProcessedFile>) => {
  act(() => {
    renderer = create(
      <UploadActions
        file={{ isUploading: false, ...file } as ProcessedFile}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        onSettingsChange={vi.fn()}
      />,
    )
  })
  return renderer!.root.findByProps({ "data-hook": "import-upload-button" })
}

describe("import upload button", () => {
  it("waits for the check of a new table name", () => {
    expect(
      uploadButton({ status: TableNameCheck.PENDING }).props.disabled,
    ).toBe(true)
  })

  it.each([
    FileCheckStatus.DOES_NOT_EXIST,
    FileCheckStatus.EXISTS,
    TableNameCheck.FAILED,
  ])("allows an upload once the name is %s", (status) => {
    expect(uploadButton({ status }).props.disabled).toBe(false)
  })

  it("does not start a second upload", () => {
    expect(
      uploadButton({
        status: FileCheckStatus.DOES_NOT_EXIST,
        isUploading: true,
      }).props.disabled,
    ).toBe(true)
  })
})
