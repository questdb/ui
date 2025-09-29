import React, { useCallback, useState } from "react"
import styled from "styled-components"
import { Heading, Button, Switch, Loader } from "@questdb/react-components"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { Dropbox } from "../Dropbox"
import { DropboxUploadArea } from "../DropboxUploadArea"
import { ParquetFileList } from "./ParquetFileList"
import { ParquetUploadError, ProcessedParquet, UploadError } from "./types"
import { useContext } from "react"
import { QuestContext } from "../../../providers"
import { CheckmarkOutline, CloseOutline } from "@styled-icons/evaicons-outline"
import { theme } from "../../../theme"

const Root = styled(Box).attrs({ gap: "3rem", flexDirection: "column" })`
  flex: 1;
`

const ControlPanel = styled(Box).attrs({ gap: "2rem", justifyContent: "space-between" })`
  align-self: flex-end;
`

const UploadButton = styled(Button)`
  min-width: 150px;
`

const CheckmarkIcon = styled(CheckmarkOutline)`
  color: ${({ theme }) => theme.color.green};
  flex-shrink: 0;
`

const CloseIcon = styled(CloseOutline)`
  color: ${({ theme }) => theme.color.red};
  flex-shrink: 0;
`

type State = "upload" | "list"

type Props = {
  onViewData: (query: string) => void
}

export const ImportParquet = ({ onViewData }: Props) => {
  const { quest } = useContext(QuestContext)
  const [files, setFiles] = useState<ProcessedParquet[]>([])
  const [state, setState] = useState<State>("upload")
  const [overwrite, setOverwrite] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [status, setStatus] = useState<{ type: "error" | "success" | "warning", message: string } | undefined>(undefined)

  const handleFilesDropped = useCallback((droppedFiles: File[]) => {
    const newFiles: ProcessedParquet[] = droppedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      fileObject: file,
      file_name: file.name,
    }))
    
    setFiles((prevFiles) => [...prevFiles, ...newFiles])
    setState("list")
  }, [])

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prevFiles) => prevFiles.filter((f) => f.id !== id))
    if (files.length === 1) {
      setState("upload")
    }
  }, [files])

  const handleFileNameChange = useCallback((id: string, name: string) => {
    setFiles((prevFiles) =>
      prevFiles.map((f) => (f.id === id ? { ...f, file_name: name } : f))
    )
  }, [])

  const handleUploadAll = useCallback(async () => {
    if (files.length === 0 || isUploading) return

    setIsUploading(true)
    setStatus({ type: "warning", message: `Uploading...` })
    setFiles(prevFiles => 
      prevFiles.map(f => ({ ...f, isUploading: true, cancelled: false, error: undefined, uploaded: false }))
    )

    let remainingFiles = files.map((file, index) => ({
      file: file.fileObject,
      name: file.file_name,
      originalIndex: index
    }))
    
    const failedFiles: number[] = []
    let successCount = 0
    let processedCount = 0
    
    while (remainingFiles.length > 0) {
      try {
        const filesToUpload = remainingFiles.map(f => ({
          file: f.file,
          name: f.name
        }))
        
        await quest.uploadParquetFiles(
          filesToUpload, 
          overwrite
        )
        
        const successfulIndices = remainingFiles.map(f => f.originalIndex)
        successCount += remainingFiles.length
        processedCount += remainingFiles.length
        
        setFiles(prevFiles =>
          prevFiles.map((f, i) => {
            if (successfulIndices.includes(i)) {
              return { ...f, isUploading: false, uploaded: true, error: undefined }
            }
            return f
          })
        )
        break
        
      } catch (error) {
        const uploadError = error as UploadError
        
        if (!uploadError.response) {
          setStatus({ type: "error", message: `Upload error: ${uploadError.statusText || 'Upload failed'}` })
          setFiles(prevFiles =>
            prevFiles.map(f => ({ ...f, isUploading: false, uploaded: false }))
          )
          break
        }
        
        try {
          const errorData = JSON.parse(uploadError.response) as ParquetUploadError
          if (errorData.errors && Array.isArray(errorData.errors)) {
            const uploadError = errorData.errors[0]
            const errorFileName = uploadError.meta.name
            
            const failedFileIndex = remainingFiles.findIndex(f => f.name === errorFileName)
            
            if (failedFileIndex !== -1) {
              const failedFile = remainingFiles[failedFileIndex]
              failedFiles.push(failedFile.originalIndex)
              
              const successfulFiles = remainingFiles.slice(0, failedFileIndex)
              successCount += successfulFiles.length
              processedCount += failedFileIndex + 1
              
              setStatus({
                type: "warning",
                message: `Uploading...${processedCount > 0 ? ` (Processed ${processedCount}/${files.length})` : ''}`
              })
              
              setFiles(prevFiles =>
                prevFiles.map((f, i) => {
                  if (i === failedFile.originalIndex) {
                    return { ...f, error: uploadError.detail, isUploading: false, uploaded: false }
                  }
                  if (successfulFiles.some(sf => sf.originalIndex === i)) {
                    return { ...f, isUploading: false, uploaded: true }
                  }
                  return f
                })
              )
              
              remainingFiles = remainingFiles.slice(failedFileIndex + 1)
              
              if (remainingFiles.length > 0) {
                continue
              }
            } else {
              setStatus({ type: "error", message: "Failed to identify the problematic file" })
              break
            }
          } else {
            setStatus({ type: "error", message: `Server error: ${uploadError.statusText || 'Unknown error'}` })
            break
          }
        } catch (parseError) {
          setStatus({ type: "error", message: `Failed to parse error response: ${uploadError.statusText || 'Unknown error'}` })
          break
        }
      }
    }
    
    setFiles(prevFiles =>
      prevFiles.map((f, i) => {
        if (!failedFiles.includes(i) && !f.uploaded && !f.error) {
          return { ...f, isUploading: false, cancelled: true }
        }
        return { ...f, isUploading: false }
      })
    )
    
    if (successCount === files.length) {
      setStatus({ type: "success", message: `Uploaded ${files.length} files successfully` })
    } else if (failedFiles.length > 0) {
      setStatus({ type: "error", message: `Failed after uploading ${successCount}/${files.length} files` })
    }
    
    setIsUploading(false)
  }, [files, overwrite, quest, isUploading])

  const handleSingleFileUpload = useCallback(async (id: string) => {
    const file = files.find(f => f.id === id)
    if (!file || isUploading) return
    
    setIsUploading(true)
    setFiles(prevFiles => 
      prevFiles.map(f => f.id === id 
        ? { ...f, isUploading: true, uploaded: false, error: undefined } 
        : f
      )
    )
    
    try {
      await quest.uploadParquetFiles(
        [{ file: file.fileObject, name: file.file_name }],
        overwrite
      )
      
      setFiles(prevFiles => 
        prevFiles.map(f => f.id === id 
          ? { ...f, isUploading: false, uploaded: true, error: undefined }
          : f
        )
      )
    } catch (error) {
      const uploadError = error as UploadError
      
      if (!uploadError.response) {
        setFiles(prevFiles =>
          prevFiles.map(f => f.id === id
            ? { ...f, isUploading: false, uploaded: false, error: uploadError.statusText || 'Network error: Unable to connect to server' }
            : f
          )
        )
      } else {
        try {
          const errorData = JSON.parse(uploadError.response) as ParquetUploadError
          const errorMessage = errorData.errors?.[0]?.detail || 'Upload failed'
          setFiles(prevFiles =>
            prevFiles.map(f => f.id === id
              ? { ...f, isUploading: false, uploaded: false, error: errorMessage }
              : f
            )
          )
        } catch (parseError) {
          setFiles(prevFiles =>
            prevFiles.map(f => f.id === id
              ? { ...f, isUploading: false, uploaded: false, error: uploadError.statusText || 'Failed to parse the error response from the server' }
              : f
            )
          )
        }
      }
    } finally {
      setIsUploading(false)
    }
  }, [files, overwrite, quest, isUploading])

  return (
    <Root>
      {state === "upload" && (
        <Dropbox 
          existingFileNames={files.map(f => f.file_name)}
          onFilesDropped={handleFilesDropped}
          render={({ duplicates, addToQueue, uploadInputRef }) => (
            <DropboxUploadArea
              title="Drag Parquet files here or paste from clipboard"
              accept=".parquet"
              uploadInputRef={uploadInputRef}
              addToQueue={addToQueue}
              duplicates={duplicates}
              mode="initial"
            />
          )}
        />
      )}

      {state === "list" && (
        <Dropbox
          existingFileNames={files.map(f => f.file_name)}
          onFilesDropped={handleFilesDropped}
          render={({ duplicates, addToQueue, uploadInputRef }) => (
            <Box style={{ padding: "2rem" }} flexDirection="column" gap="2rem">
              <Box flexDirection="column" gap="2rem">
                <Heading level={3}>Import queue</Heading>
                <DropboxUploadArea
                  title=""
                  accept=".parquet"
                  uploadInputRef={uploadInputRef}
                  addToQueue={addToQueue}
                  duplicates={duplicates}
                  mode="list"
                />
              </Box>
              <ControlPanel>
            <Box align="center" gap="2rem">
              {status && (
                <Box align="center" gap="0.5rem">
                  {status.type === "success" && <CheckmarkIcon size="18px" />}
                  {status.type === "error" && <CloseIcon size="18px" />}
                  {status.type === "warning" && <span style={{ color: theme.color.orange }}><Loader size="18px" /></span>}
                  <Text color={status.type === "error" ? "red" : status.type === "success" ? "green" : "orange"}>
                    {status.message}
                  </Text>
                </Box>
              )}
              <Box align="center" gap="1rem">
                <Switch
                  checked={overwrite}
                  onChange={(checked) => setOverwrite(checked)}
                />
                <Text color="foreground">
                  Overwrite existing files
                </Text>
              </Box>
            </Box>
            
            <UploadButton
              skin="primary"
              size="md"
              onClick={handleUploadAll}
              disabled={isUploading || files.length === 0}
            >
              {isUploading ? "Uploading..." : "Import all files"}
            </UploadButton>
              </ControlPanel>

              <ParquetFileList
                files={files}
                onRemoveFile={handleRemoveFile}
                onFileNameChange={handleFileNameChange}
                onAddMoreFiles={handleFilesDropped}
                onViewData={onViewData}
                onSingleFileUpload={handleSingleFileUpload}
                isUploading={isUploading}
              />
            </Box>
          )}
        />
      )}
    </Root>
  )
}