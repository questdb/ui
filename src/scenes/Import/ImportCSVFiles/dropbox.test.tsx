import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../../theme"
import type { ProcessedFile } from "./types"

vi.mock("../../../components", () => ({ Box: "div" }))

import { DropBox } from "./dropbox"

let renderer: ReactTestRenderer | undefined

beforeEach(() => {
  // Paste is listened for on the window.
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
})

const csv = (name: string) => ({ name }) as File
const fileList = (...files: File[]) => files as unknown as FileList
const listed = (name: string) => ({ table_name: name }) as ProcessedFile

const mount = () => {
  // As ImportCSVFiles does, count a dropped file as unlisted until its table
  // name check answers.
  const unlisted: string[] = []
  const onFilesDropped = vi.fn((files: File[]) => {
    unlisted.push(...files.map((file) => file.name))
  })
  const box: {
    addToQueue: (files: FileList) => void
    duplicates: File[]
  } = { addToQueue: () => {}, duplicates: [] }
  const element = (files: ProcessedFile[]) => (
    <ThemeProvider theme={darkTheme}>
      <DropBox
        files={files}
        unlistedNames={() => unlisted}
        onFilesDropped={onFilesDropped}
        dialogOpen={false}
        render={({ addToQueue, duplicates }) => {
          box.addToQueue = addToQueue
          box.duplicates = duplicates
          return null
        }}
      />
    </ThemeProvider>
  )
  act(() => {
    renderer = create(element([]))
  })
  const setFiles = (files: ProcessedFile[]) =>
    act(() => renderer!.update(element(files)))
  return {
    onFilesDropped,
    box,
    setFiles,
    // The check answered: the file is listed, so no longer unlisted.
    list: (files: ProcessedFile[]) => {
      setFiles(files)
      files.forEach(({ table_name }) => {
        const index = unlisted.indexOf(table_name)
        if (index !== -1) unlisted.splice(index, 1)
      })
    },
  }
}

// A dropped file is listed once its table name is checked, which can wait up
// to ten seconds for a token refresh.
describe("DropBox", () => {
  it("reports a file dropped again before its first drop is listed", () => {
    const { onFilesDropped, box } = mount()
    const first = csv("trades.csv")
    act(() => box.addToQueue(fileList(first)))

    const again = csv("trades.csv")
    act(() => box.addToQueue(fileList(again)))

    expect(onFilesDropped.mock.calls).toEqual([[[first]]])
    expect(box.duplicates).toEqual([again])
  })

  it("reports a file dropped again while the list changes before the first drop is listed", () => {
    // Given a dropped file whose table name check is pending
    const { onFilesDropped, box, setFiles } = mount()
    const first = csv("trades.csv")
    act(() => box.addToQueue(fileList(first)))

    // When the list changes meanwhile, e.g. with an upload's progress
    setFiles([listed("quotes.csv")])
    const again = csv("trades.csv")
    act(() => box.addToQueue(fileList(again)))

    // Then the file is still reported as already queued
    expect(onFilesDropped.mock.calls).toEqual([[[first]]])
    expect(box.duplicates).toEqual([again])
  })

  it("reports a file dropped again once its first drop is listed", () => {
    const { onFilesDropped, box, list } = mount()
    act(() => box.addToQueue(fileList(csv("trades.csv"))))
    list([listed("trades.csv")])

    const again = csv("trades.csv")
    act(() => box.addToQueue(fileList(again)))

    expect(onFilesDropped).toHaveBeenCalledOnce()
    expect(box.duplicates).toEqual([again])
  })

  it("accepts a file again once it was removed from the list", () => {
    const { onFilesDropped, box, setFiles, list } = mount()
    act(() => box.addToQueue(fileList(csv("trades.csv"))))
    list([listed("trades.csv")])
    setFiles([])

    act(() => box.addToQueue(fileList(csv("trades.csv"))))

    expect(onFilesDropped).toHaveBeenCalledTimes(2)
    expect(box.duplicates).toEqual([])
  })
})
