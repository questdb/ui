// @vitest-environment jsdom
import React from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FileCheckStatus } from "../../../utils/questdb/types"
import { TableNameCheck, type ProcessedFile } from "./types"

vi.mock("../../../components", async () => {
  const { domStandIn } = await import("../../../test/domStandIn")
  return {
    Box: domStandIn("div", ["flexDirection"]),
    Button: domStandIn("button", ["prefixIcon"]),
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})
vi.mock("../../../components/icons", () => ({
  Close: () => null,
  Upload2: () => null,
}))
vi.mock("./upload-settings-dialog", () => ({
  UploadSettingsDialog: () => null,
}))

import { UploadActions } from "./upload-actions"

afterEach(() => {
  cleanup()
})

const uploadButton = (file: Partial<ProcessedFile>) => {
  const { container } = render(
    <UploadActions
      file={{ isUploading: false, ...file } as ProcessedFile}
      onUpload={vi.fn()}
      onRemove={vi.fn()}
      onSettingsChange={vi.fn()}
    />,
  )
  return container.querySelector<HTMLButtonElement>(
    '[data-hook="import-upload-button"]',
  )!
}

describe("import upload button", () => {
  it("waits for the check of a new table name", () => {
    expect(uploadButton({ status: TableNameCheck.PENDING }).disabled).toBe(true)
  })

  it.each([
    FileCheckStatus.DOES_NOT_EXIST,
    FileCheckStatus.EXISTS,
    TableNameCheck.FAILED,
  ])("allows an upload once the name is %s", (status) => {
    expect(uploadButton({ status }).disabled).toBe(false)
  })

  it("does not start a second upload", () => {
    expect(
      uploadButton({
        status: FileCheckStatus.DOES_NOT_EXIST,
        isUploading: true,
      }).disabled,
    ).toBe(true)
  })
})
