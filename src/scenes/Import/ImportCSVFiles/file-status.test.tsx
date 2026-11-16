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
    Badge: ({
      type,
      children,
    }: {
      type: string
      children: React.ReactNode
    }) => <span data-type={type}>{children}</span>,
  }
})
vi.mock("../../../components/icons", () => ({ CheckboxCircle: () => null }))

import { FileStatus } from "./file-status"

afterEach(() => {
  cleanup()
})

const badge = (status: string) => {
  const file = {
    status,
    isUploading: false,
    uploaded: false,
    uploadProgress: 0,
  } as ProcessedFile
  const { container } = render(<FileStatus file={file} />)
  const root = container.querySelector("span")!
  return {
    type: root.getAttribute("data-type")!,
    label: container.textContent,
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
