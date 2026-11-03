import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FileCheckStatus } from "../../../utils/questdb/types"
import { TableNameCheck, type ProcessedFile } from "./types"

vi.mock("../../../components", () => ({
  Box: "div",
  Badge: ({ type, children }: { type: string; children: React.ReactNode }) => (
    <span data-type={type}>{children}</span>
  ),
}))
vi.mock("../../../components/icons", () => ({ CheckboxCircle: () => null }))

import { FileStatus } from "./file-status"

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

const badge = (status: string) => {
  const file = {
    status,
    isUploading: false,
    uploaded: false,
    uploadProgress: 0,
  } as ProcessedFile
  act(() => {
    renderer = create(<FileStatus file={file} />)
  })
  const root = renderer!.root.findByType("span")
  return {
    type: root.props["data-type"] as string,
    label: JSON.stringify(renderer!.toJSON()),
  }
}

describe("import file status", () => {
  it.each([
    [FileCheckStatus.DOES_NOT_EXIST, "success", "Ready to upload"],
    [FileCheckStatus.EXISTS, "warning", "Table already exists"],
    [TableNameCheck.PENDING, "info", "Checking table name…"],
    [TableNameCheck.FAILED, "warning", "Could not check table name"],
  ])("shows %s with the %s badge", (status, type, label) => {
    expect(badge(status)).toEqual({
      type,
      label: expect.stringContaining(label) as string,
    })
  })

  it("never shows a pending name as ready to upload", () => {
    expect(badge(TableNameCheck.PENDING).label).not.toContain("Ready to upload")
  })
})
