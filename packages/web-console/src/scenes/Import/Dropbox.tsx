import React, { useRef, useState, useEffect } from "react"
import styled from "styled-components"
import { Box } from "../../components/Box"

const getFileDuplicates = (
  inputFiles: FileList,
  existingFileNames: string[],
) => {
  const duplicates = Array.from(inputFiles).filter((f) =>
    existingFileNames.includes(f.name),
  )
  return duplicates
}

const Root = styled(Box).attrs({ flexDirection: "column" })<{ $isDragging: boolean }>`
  flex: 1;
  width: 100%;
  gap: 2rem;
  background: ${({ theme, $isDragging }) => $isDragging ? theme.color.selectionDarker : theme.color.backgroundLighter};
  box-shadow: inset 0 0 10px 0 #1b1c23;
  transition: all 0.15s ease-in-out;
`

type Props = {
  existingFileNames: string[]
  onFilesDropped: (files: File[]) => void
  dialogOpen?: boolean
  enablePaste?: boolean
  render: (props: {
    duplicates: File[]
    addToQueue: (inputFiles: FileList) => void
    uploadInputRef: React.RefObject<HTMLInputElement>
  }) => React.ReactNode
}

export const Dropbox = ({
  existingFileNames,
  onFilesDropped,
  dialogOpen = false,
  enablePaste = true,
  render,
}: Props) => {
  const [isDragging, setIsDragging] = useState(false)
  const [duplicates, setDuplicates] = useState<File[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

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
    const duplicates = getFileDuplicates(inputFiles, existingFileNames)
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
    if (!enablePaste) return
    
    return () => {
      window.removeEventListener("paste", handlePaste)
    }
  }, [enablePaste])

  useEffect(() => {
    if (!enablePaste) return
    
    if (dialogOpen) {
      window.removeEventListener("paste", handlePaste)
    } else {
      window.addEventListener("paste", handlePaste)
    }
  }, [dialogOpen, enablePaste])

  return (
    <Root
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      data-hook="import-dropbox"
      $isDragging={isDragging}
    >
      {render({ duplicates, addToQueue, uploadInputRef })}
    </Root>
  )
}