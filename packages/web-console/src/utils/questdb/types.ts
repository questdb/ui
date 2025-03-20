export type ColumnDefinition = Readonly<{ name: string; type: string }>

export type Value = string | number | boolean
export type RawData = Record<string, Value>

export enum Type {
  DDL = "ddl",
  DML = "dml",
  DQL = "dql",
  ERROR = "error",
  NOTICE = "notice",
}

export type Timings = {
  compiler: number
  authentication: number
  count: number
  execute: number
  fetch: number
}

export type Explain = { jitCompiled: boolean }

export type DatasetType = Array<boolean | string | number>

export type RawDqlResult = {
  columns: ColumnDefinition[]
  count: number
  dataset: DatasetType[]
  ddl: undefined
  dml: undefined
  notice: undefined
  error: undefined
  query: string
  timings: Timings
  explain?: Explain
}

export type RawDdlResult = {
  ddl: "OK"
  dml: undefined
}

export type RawDmlResult = {
  ddl: undefined
  dml: "OK"
}

export type RawErrorResult = {
  ddl: undefined
  dml: undefined
  error: "<error message>"
  position: number
  query: string
}

export type RawNoticeResult = {
  ddl: undefined
  dml: undefined
  error: undefined
  notice: "<notice message>"
  position: undefined
  query: string
}

export type DdlResult = {
  query: string
  type: Type.DDL
}

export type DmlResult = {
  query: string
  type: Type.DML
}

export type RawResult =
  | RawDqlResult
  | RawDmlResult
  | RawDdlResult
  | RawErrorResult
  | RawNoticeResult

export type ErrorResult = RawErrorResult & {
  type: Type.ERROR
  status: number
}

export type NoticeResult = RawNoticeResult & {
  type: Type.NOTICE
}

export type QueryRawResult =
  | (Omit<RawDqlResult, "ddl" | "dml"> & { type: Type.DQL })
  | DmlResult
  | DdlResult
  | ErrorResult
  | NoticeResult

export type QueryResult<T extends Record<string, any>> =
  | {
      columns: ColumnDefinition[]
      count: number
      data: T[]
      timings: Timings
      type: Type.DQL
      explain?: Explain
    }
  | ErrorResult
  | DmlResult
  | DdlResult
  | NoticeResult

export type PartitionBy = "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" | "NONE"

export type Table = {
  id: number
  table_name: string
  partitionBy: PartitionBy
  designatedTimestamp: string
  walEnabled: boolean
  dedup: boolean
  ttlValue: number
  ttlUnit: string
  matView: boolean
}

export type Partition = {
  index: number
  partitionBy: PartitionBy
  name: string
  minTimestamp: string | null
  maxTimestamp: string | null
  numRows: string
  diskSize: string
  diskSizeHuman: string
  readOnly: boolean
  active: boolean
  attached: boolean
  detached: boolean
  attachable: boolean
}

export enum ErrorTag {
  DISK_FULL = "DISK FULL",
  TOO_MANY_OPEN_FILES = "TOO MANY OPEN FILES",
  OUT_OF_MMAP_AREAS = "OUT OF MMAP AREAS",
  OUT_OF_MEMORY = "OUT OF MEMORY",
  UNSUPPORTED_FILE_SYSTEM = "UNSUPPORTED FILE SYSTEM",
}

export type WalTable = {
  name: string
  suspended: boolean
  writerTxn: string
  writerLagTxnCount: string
  sequencerTxn: string
  errorTag?: ErrorTag
  errorMessage?: string
}

export type MaterializedView = {
  view_name: string
  refresh_type: string
  base_table_name: string
  last_refresh_timestamp: string
  view_sql: string
  view_table_dir_name: string
  invalidation_reason: string
  view_status: "valid" | "invalid"
  base_table_txn: number
  applied_base_table_txn: number
}

export type Column = {
  column: string
  indexed: boolean
  designated: boolean
  indexBlockCapacity: number
  symbolCached: boolean
  symbolCapacity: number
  type: string
  upsertKey: boolean
}

export type Options = {
  limit?: string
  explain?: boolean
  nm?: boolean
  count?: boolean
  cols?: string
  src?: string
}

export type Release = {
  assets: {
    browser_download_url: string
    name: string
    size: number
  }[]
  html_url: string
  name: string
  published_at: string
}

export type NewsThumbnail = {
  id: string
  width: number
  height: number
  url: string
  filename: string
  size: number
  type: string
  thumbnails: Record<
    "small" | "large" | "full",
    {
      url: string
      width: number
      height: number
    }
  >
}

export type NewsItem = {
  id: string
  title: string
  body: string
  thumbnail?: NewsThumbnail[]
  status: "published" | "draft"
  date: string
}

export enum FileCheckStatus {
  EXISTS = "Exists",
  DOES_NOT_EXIST = "Does not exist",
  RESERVED_NAME = "Reserved name",
}

export type FileCheckResponse = {
  status: FileCheckStatus
}

export type UploadModeSettings = {
  forceHeader: boolean
  overwrite: boolean
  skipLev: boolean
  delimiter: string
  atomicity: string
  maxUncommitedRows: number
}

export type SchemaColumn = {
  name: string
  type: string
  pattern?: string
  upsertKey?: boolean
}

export type InformationSchemaColumn = {
  table_name: string
  ordinal_position: number
  column_name: string
  data_type: string
}

export type UploadOptions = {
  file: File
  name: string
  settings?: UploadModeSettings
  schema?: SchemaColumn[]
  partitionBy?: string
  timestamp?: string
  onProgress: (progress: number) => void
}

export type UploadResultColumn = {
  name: string
  type: string
  size: number
  errors: number
}

export type UploadResult = {
  columns: UploadResultColumn[]
  header: boolean
  location: string
  rowsImported: number
  rowsRejected: number
  status: string
}

export type Parameter = {
  property_path: string
  env_var_name: string
  value: string | null
  value_source: string
  sensitive: boolean
  dynamic: boolean
}
