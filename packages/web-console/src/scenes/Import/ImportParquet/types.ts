export type ProcessedParquet = {
  id: string
  fileObject: File
  file_name: string
  isUploading?: boolean
  uploaded?: boolean
  error?: string
  cancelled?: boolean
}

export type ParquetUploadError = {
  errors: {
    meta: {
      name: string
    }
    detail: string
    status: string
  }[]
}

export type UploadError = {
  status: number
  statusText: string
  response?: string
}