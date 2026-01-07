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

export type InstanceType = "development" | "production" | "testing"

export type Preferences = Partial<{
  version: number
  instance_name: string
  instance_rgb: string
  instance_description: string
  instance_type: InstanceType
}>

export type Permission = {
  grant_option: boolean
  origin: string
  permission: string
  table_name: string | null
  column_name: string | null
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

export type QueryResult<T extends Record<string, unknown>> =
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

type QueryType =
  | "INSERT"
  | "TRUNCATE"
  | "ALTER TABLE"
  | "SET"
  | "DROP"
  | "COPY"
  | "CREATE TABLE"
  | "INSERT AS SELECT"
  | "COPY REMOTE"
  | "RENAME TABLE"
  | "REPAIR"
  | "BACKUP TABLE"
  | "UPDATE"
  | "VACUUM"
  | "BEGIN"
  | "COMMIT"
  | "ROLLBACK"
  | "CREATE AS SELECT"
  | "CHECKPOINT CREATE"
  | "CHECKPOINT RELEASE"
  | "DEALLOCATE"
  | "EXPLAIN"
  | "TABLE RESUME"

export type ValidateQuerySuccessResult =
  | {
      query: string
      columns: Array<{
        name: string
        type: string
        dim?: number
        elemType?: string
      }>
      timestamp: number
    }
  | {
      queryType: QueryType
    }

export type ValidateQueryErrorResult = {
  query: string
  position: number
  error: string
}

export type ValidateQueryResult =
  | ValidateQuerySuccessResult
  | ValidateQueryErrorResult

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
  directoryName: string
  maxUncommittedRows: number
  o3MaxLag: number
  table_suspended: boolean
  table_row_count: number | null
  table_max_timestamp: string | null
  table_txn: number | null
  table_memory_pressure_level: number | null
  wal_pending_row_count: number | null
  wal_txn: number | null
  wal_tx_count: number | null
  wal_max_timestamp: string | null
  dedup_row_count_since_start: number | null
  table_write_amp_count: number | null
  table_write_amp_p50: number | null
  table_write_amp_p90: number | null
  table_write_amp_p99: number | null
  table_write_amp_max: number | null
  table_merge_rate_count: number | null
  table_merge_rate_p50: number | null
  table_merge_rate_p90: number | null
  table_merge_rate_p99: number | null
  table_merge_rate_max: number | null
  wal_tx_size_p50: number | null
  wal_tx_size_p90: number | null
  wal_tx_size_p99: number | null
  wal_tx_size_max: number | null
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
  last_refresh_start_timestamp: string | null
  last_refresh_finish_timestamp: string | null
  view_sql: string
  view_table_dir_name: string
  invalidation_reason: string | null
  view_status: "valid" | "refreshing" | "invalid"
  refresh_period_hi: string | null
  refresh_base_table_txn: number
  base_table_txn: number
  refresh_limit: number
  refresh_limit_unit: string | null
  timer_time_zone: string | null
  timer_start: string | null
  timer_interval: number
  timer_interval_unit: string | null
  period_length: number
  period_length_unit: string | null
  period_delay: number
  period_delay_unit: string | null
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

export type SymbolColumnDetails = {
  symbolCached: boolean
  symbolCapacity: number
  indexed: boolean
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
  owner: string
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
