import React, { useRef, useState, useEffect } from "react"
import styled from "styled-components"
import { Box } from "../../../components"
import { ProcessedFile } from "./types"

const getFileDuplicates = (
  inputFiles: FileList,
  existingFileNames: string[],
) => {
  const duplicates = Array.from(inputFiles).filter((f) =>
    existingFileNames.includes(f.name),
  )
  return duplicates
}

const Root = styled(Box).attrs({ flexDirection: "column" })<{
  isDragging: boolean
}>`
  flex: 1;
  width: 100%;
  padding: 4rem 0 0;
  gap: 2rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 3px dashed ${({ isDragging }) => (isDragging ? "#7f839b" : "#333543")};
  box-shadow: inset 0 0 10px 0 #1b1c23;
  transition: all 0.15s ease-in-out;
`

type Props = {
  files: ProcessedFile[]
  onFilesDropped: (files: File[]) => void
  dialogOpen: boolean
  render: (props: {
    duplicates: File[]
    addToQueue: (inputFiles: FileList) => void
  }) => React.ReactNode
}

export const DropBox = ({
  files,
  onFilesDropped,
  dialogOpen,
  render,
}: Props) => {
  const [isDragging, setIsDragging] = useState(false)
  const [duplicates, setDuplicates] = useState<File[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const filenames = useRef<string[]>(files.map((f) => f.table_name))

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(e.type === "dragenter" || e.type === "dragover")
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    addToQueue(e.dataTransfer.files)
  }

  const addToQueue = (inputFiles: FileList) => {
    const duplicates = getFileDuplicates(inputFiles, filenames.current)
    setDuplicates(duplicates)
    onFilesDropped(
      Array.from(inputFiles).filter((f) => !duplicates.includes(f)),
    )
    uploadInputRef.current?.setAttribute("value", "")
  }

  const handlePaste = (event: Event) => {
    const clipboardEvent = event as ClipboardEvent
    const clipboardFiles = clipboardEvent.clipboardData?.files
    if (clipboardFiles) {
      addToQueue(clipboardFiles)
    }
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("paste", handlePaste)
    }
  }, [])

  useEffect(() => {
    if (dialogOpen) {
      window.removeEventListener("paste", handlePaste)
    } else {
      window.addEventListener("paste", handlePaste)
    }
  }, [dialogOpen])

  useEffect(() => {
    filenames.current = files.map((f) => f.table_name)
  }, [files])

  return (
    <Root
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      isDragging={isDragging}
      data-hook="import-dropbox"
    >
      {render({ duplicates, addToQueue })}
    </Root>
  )
}
