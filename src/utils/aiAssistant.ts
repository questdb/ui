import { Client } from "./questdb/client"
import {
  Type,
  Table,
  TableKind,
  ValidateQueryResult,
  getTableKind,
} from "./questdb/types"
import { mapQueryRawToResult, type RunQueryRawResult } from "./tools/runQuery"
import type { ProviderId } from "./ai"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"
import { normalizeSql } from "./formatSql"
import { AIOperationStatus, StatusArgs } from "../providers/AIStatusProvider"
import type {
  ConversationId,
  ConversationMessage,
} from "../providers/AIConversationProvider/types"
import { compactConversationIfNeeded, toApiMessages } from "./contextCompaction"
import {
  createProvider,
  toolsForPermission,
  getUnifiedPrompt,
  getAiPermissions,
  readLiveAiPermissions,
  BUILTIN_PROVIDERS,
} from "./ai"
import type { AIProvider } from "./ai"
import type { ToolExecutionContext } from "./ai/shared"
import { getCellRunStatus, type RunStatus } from "./ai/runStatus"
import {
  getController,
  getUserActionSeq,
  getWorkspace,
  NotebookToolError,
  withBoundNotebook,
  withBoundNotebookReadOnly,
  type ApplyNotebookStateRequest,
  type NotebookController,
} from "./notebookAIBridge"
import {
  MAX_NOTEBOOK_CELLS,
  MAX_CELL_LINES,
  exceedsCellLineLimit,
} from "../store/notebook"
import type { CellMode, CellType } from "../store/notebook"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  buildSnapshot,
  sanitizeForPromptContext,
  toChartConfigWire,
  type ChartConfigWire,
  type NotebookContextSnapshot,
} from "./ai/notebookSnapshot"

export type ActiveProviderSettings = {
  model: string
  provider: ProviderId
  apiKey: string
  aiAssistantSettings?: AiAssistantSettings
}

export interface AiAssistantAPIError {
  type: "rate_limit" | "invalid_key" | "network" | "unknown" | "aborted"
  message: string
  details?: string
}

export type AiAssistantValidateQueryResult =
  | { valid: true }
  | { valid: false; error: string; position: number }

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface GeneratedSQL {
  sql: string | null
  explanation?: string
  tokenUsage?: TokenUsage
}

export type NotebookCellSummary = {
  id: string
  preview: string
  position: number
  // Omitted for SQL cells (the default); "markdown" for prose cells.
  type?: "sql" | "markdown"
  mode?: "run" | "draw"
  last_run_status?: RunStatus
}

export type NotebookCellDetails = {
  id: string
  value: string
  truncated?: true
  full_length?: number
  position: number
  type?: "sql" | "markdown"
  mode?: "run" | "draw"
  auto_refresh?: boolean
  is_chart_maximized?: boolean
  chart_config?: ChartConfigWire
  last_run_status?: RunStatus
  last_run_error?: string
}

export interface ModelToolsClient {
  validateQuery: (query: string) => Promise<AiAssistantValidateQueryResult>
  // The AI-flavored `validateQuery` above lacks queryType needed to classify DDL/DML.
  validateSqlRaw: (query: string) => Promise<ValidateQueryResult>
  runQueryRaw: (
    sql: string,
    requestedLimit: number,
    signal?: AbortSignal,
  ) => Promise<RunQueryRawResult>
  getTables?: () => Promise<Array<{ name: string; type: TableKind }>>
  getTableSchema?: (tableName: string) => Promise<string | null>
  getTableDetails?: (tableName: string) => Promise<Table | null>

  createNotebook: (
    label?: string,
  ) => Promise<{ bufferId: number; label: string }>
  duplicateNotebook: (
    bufferId: number,
  ) => Promise<{ bufferId: number; label: string }>
  deleteNotebook: (bufferId: number) => Promise<void>
  listCells: (bufferId: number) => Promise<NotebookCellSummary[]>
  getCell: (
    bufferId: number,
    cellId: string,
    getFullContent?: boolean,
  ) => Promise<NotebookCellDetails>
  getNotebookState: (bufferId: number) => Promise<NotebookContextSnapshot>
  addCell: (
    bufferId: number,
    value: string,
    afterCellId?: string,
    type?: CellType,
  ) => Promise<{ cellId: string }>
  updateCell: (
    bufferId: number,
    cellId: string,
    updates: { value: string },
  ) => Promise<void>
  deleteCell: (bufferId: number, cellId: string) => Promise<void>
  moveCellUp: (bufferId: number, cellId: string) => Promise<void>
  moveCellDown: (bufferId: number, cellId: string) => Promise<void>
  duplicateCell: (
    bufferId: number,
    cellId: string,
  ) => Promise<{ cellId: string }>
  runCell: (
    bufferId: number,
    cellId: string,
    signal?: AbortSignal,
    sql?: string,
  ) => Promise<{
    success: boolean
    queryCount: number
    results: string[]
    unverified?: boolean
    note?: string
  }>
  setLayoutMode: (bufferId: number, mode: "list" | "grid") => Promise<void>
  setCellLayout: (
    bufferId: number,
    cellId: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => Promise<void>
  setCellMode: (
    bufferId: number,
    cellId: string,
    mode: CellMode,
  ) => Promise<void>
  setCellChartConfig: (
    bufferId: number,
    cellId: string,
    patch: Partial<ChartConfig>,
  ) => Promise<void>
  setCellAutoRefresh: (
    bufferId: number,
    cellId: string,
    value: boolean,
  ) => Promise<void>
  setCellChartMaximized: (
    bufferId: number,
    cellId: string,
    value: boolean,
  ) => Promise<void>
  setCellMaximized: (bufferId: number, cellId: string | null) => Promise<void>
  // cells is the COMPLETE desired list — missing ids are deleted; validation is all-or-nothing.
  applyNotebookState: (
    bufferId: number,
    request: ApplyNotebookStateRequest,
  ) => Promise<{
    applied: { added: string[]; updated: string[]; deleted: string[] }
  }>
  // null → gate falls through so the executor's not-found error wins.
  getCellSql?: (bufferId: number, cellId: string) => string | null
  // Cell kind, for tools that must treat markdown cells differently (e.g.
  // run_cell skips them). null → cell not found.
  getCellType?: (bufferId: number, cellId: string) => CellType | null
}

export type NotebookClientExtras = {
  conversationId?: ConversationId
  bindNotebook?: (
    conversationId: ConversationId,
    bufferId: number,
  ) => Promise<void>
  // Lets the Abort button cancel a pending waiter instead of blocking for the full waitForController timeout.
  abortSignal?: AbortSignal
}

export type StatusCallback = (
  status: AIOperationStatus | null,
  args?: StatusArgs,
) => void

export type StreamingCallback = {
  onTextChunk: (chunk: string) => void
  onThinkingChunk?: (chunk: string) => void
  onToolCall?: (call: { id: string; name: string; arguments: string }) => void
  onToolResult?: (result: {
    tool_call_id: string
    name: string
    content: string
  }) => void
  onResponseStart?: () => void
  onBeforeStream?: () => void
}

export function isAiAssistantError(
  response: AiAssistantAPIError | GeneratedSQL | Partial<GeneratedSQL>,
): response is AiAssistantAPIError {
  if ("type" in response && "message" in response) {
    return true
  }
  return false
}

const CELL_VALUE_MAX = 4096
const FULL_CELL_VALUE_MAX = 1_000_000
const LAST_ERROR_MAX = 200

// Sanitize `<`/`>` so a server-echoed error can't smuggle closing tags into the tool response.
const trimError = (msg: string | undefined): string | undefined => {
  if (!msg) return undefined
  const clipped =
    msg.length <= LAST_ERROR_MAX
      ? msg
      : `${msg.slice(0, LAST_ERROR_MAX - 3)}...`
  return sanitizeForPromptContext(clipped)
}

const lastRunStatusForCell = (
  cell:
    | {
        result?: { results: Array<{ type: string; error?: string }> } | null
        lastRunStatus?: RunStatus
      }
    | undefined,
): {
  status: RunStatus
  error?: string
} => {
  const { status, error } = getCellRunStatus(cell)
  return status === "error" ? { status, error: trimError(error) } : { status }
}

const requireCell = (controller: NotebookController, cellId: string) => {
  const cell = controller.getCellsSnapshot().find((c) => c.id === cellId)
  if (!cell) {
    throw new NotebookToolError(
      "unknown_cell",
      `Cell ${cellId} is not in notebook ${controller.bufferId}.`,
    )
  }
  return cell
}

const requireCellWithinLineLimit = (value: string) => {
  if (exceedsCellLineLimit(value)) {
    throw new NotebookToolError(
      "cell_too_large",
      `Cell content has ${value.split("\n").length} lines, over the ${MAX_CELL_LINES}-line limit. Split it into multiple cells.`,
    )
  }
}

export function createModelToolsClient(
  questClient: Client,
  tables?: Array<Table>,
  extras?: NotebookClientExtras,
): ModelToolsClient {
  const abortSignal = extras?.abortSignal
  const bound = <T>(
    bufferId: number,
    fn: (controller: NotebookController) => Promise<T>,
  ): Promise<T> => withBoundNotebook(bufferId, fn, abortSignal)
  return {
    async validateQuery(
      query: string,
    ): Promise<AiAssistantValidateQueryResult> {
      try {
        const response = await questClient.validateQuery(query)
        if ("error" in response) {
          const errorResponse = response as {
            error: string
            position: number
            query: string
          }
          return {
            valid: false,
            error: String(errorResponse.error),
            position: Number(errorResponse.position),
          }
        }
        return {
          valid: true,
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to validate query. Something went wrong with the server."
        return {
          valid: false,
          error: errorMessage,
          position: -1,
        }
      }
    },
    validateSqlRaw(query: string): Promise<ValidateQueryResult> {
      return questClient.validateQuery(query)
    },
    runQueryRaw(
      sql: string,
      requestedLimit: number,
      signal?: AbortSignal,
    ): Promise<RunQueryRawResult> {
      return mapQueryRawToResult(questClient, sql, requestedLimit, signal)
    },
    ...(tables
      ? {
          getTables(): Promise<Array<{ name: string; type: TableKind }>> {
            return Promise.resolve(
              tables.map((table) => ({
                name: table.table_name,
                type: getTableKind(table),
              })),
            )
          },

          async getTableSchema(tableName: string): Promise<string | null> {
            try {
              const table = tables.find((t) => t.table_name === tableName)
              if (!table) {
                return null
              }

              const ddlResponse = table.matView
                ? await questClient.showMatViewDDL(tableName)
                : await questClient.showTableDDL(tableName)

              if (
                ddlResponse?.type === Type.DQL &&
                ddlResponse.data?.[0]?.ddl
              ) {
                return ddlResponse.data[0].ddl
              }

              return null
            } catch (error) {
              console.error(
                `Failed to fetch schema for table ${tableName}:`,
                error,
              )
              return null
            }
          },
          getTableDetails: async (tableName: string): Promise<Table | null> => {
            try {
              const result = await questClient.getTableDetails(tableName)
              if (result.type === Type.DQL && result.data.length > 0) {
                return result.data[0]
              }
              return null
            } catch (error) {
              console.error(
                `Failed to fetch details for table ${tableName}:`,
                error,
              )
              return null
            }
          },
        }
      : {}),

    async createNotebook(label) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      const res = await ws.createNotebook(label, abortSignal)
      // First-binding-wins: bindNotebook no-ops on an already-bound conversation.
      if (extras?.bindNotebook && extras.conversationId) {
        await extras.bindNotebook(extras.conversationId, res.bufferId)
      }
      return res
    },

    async duplicateNotebook(bufferId) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      return ws.duplicateNotebook(bufferId, abortSignal)
    },

    async deleteNotebook(bufferId) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      await ws.deleteNotebook(bufferId)
    },

    listCells(bufferId) {
      return withBoundNotebookReadOnly(
        bufferId,
        (view, ctrl) => {
          const cells = ctrl ? ctrl.getCellsSnapshot() : view.cells
          const summaries: NotebookCellSummary[] = cells.map((cell) => {
            const runInfo = lastRunStatusForCell(cell)
            const summary: NotebookCellSummary = {
              id: cell.id,
              preview:
                cell.value.length <= 120
                  ? cell.value
                  : `${cell.value.slice(0, 117)}...`,
              position: cell.position,
              last_run_status: runInfo.status,
            }
            if (cell.type === "markdown") summary.type = "markdown"
            if (cell.mode) summary.mode = cell.mode
            return summary
          })
          return Promise.resolve(summaries)
        },
        abortSignal,
      )
    },

    getCell(bufferId, cellId, getFullContent) {
      return withBoundNotebookReadOnly(
        bufferId,
        (view, ctrl) => {
          const cells = ctrl ? ctrl.getCellsSnapshot() : view.cells
          const cell = cells.find((c) => c.id === cellId)
          if (!cell) {
            throw new NotebookToolError(
              "unknown_cell",
              `Cell ${cellId} not found in notebook ${bufferId}.`,
            )
          }
          if (getFullContent && cell.value.length > FULL_CELL_VALUE_MAX) {
            throw new NotebookToolError(
              "cell_too_large",
              `Cell ${cellId} is ${cell.value.length} chars — over the ${FULL_CELL_VALUE_MAX}-char get_full_content limit, so it cannot be read or edited via agent tools. In apply_notebook_state, keep it with preserve_value:true.`,
            )
          }
          const truncated =
            !getFullContent && cell.value.length > CELL_VALUE_MAX
          const value = truncated
            ? cell.value.slice(0, CELL_VALUE_MAX)
            : cell.value
          const runInfo = lastRunStatusForCell(cell)
          const out: NotebookCellDetails = {
            id: cell.id,
            value,
            position: cell.position,
            last_run_status: runInfo.status,
            last_run_error: runInfo.error,
          }
          if (truncated) {
            out.truncated = true
            out.full_length = cell.value.length
          }
          if (cell.type === "markdown") out.type = "markdown"
          if (cell.mode) out.mode = cell.mode
          if (typeof cell.autoRefresh === "boolean")
            out.auto_refresh = cell.autoRefresh
          if (typeof cell.isChartMaximized === "boolean")
            out.is_chart_maximized = cell.isChartMaximized
          if (cell.chartConfig && Array.isArray(cell.chartConfig.queries))
            out.chart_config = toChartConfigWire(cell.chartConfig)
          return Promise.resolve(out)
        },
        abortSignal,
      )
    },

    getNotebookState(bufferId) {
      return withBoundNotebookReadOnly(
        bufferId,
        () => {
          const snap = buildSnapshot(getWorkspace(), bufferId)
          if (!snap) {
            throw new NotebookToolError(
              "not_a_notebook",
              `Buffer ${bufferId} has no notebook state.`,
            )
          }
          return Promise.resolve(snap)
        },
        abortSignal,
      )
    },

    addCell(bufferId, value, afterCellId, type) {
      return bound(bufferId, (ctrl) => {
        if (ctrl.getCellsSnapshot().length >= MAX_NOTEBOOK_CELLS) {
          throw new NotebookToolError(
            "cell_limit",
            `Notebook ${bufferId} already has the maximum of ${MAX_NOTEBOOK_CELLS} cells. Delete a cell before adding another.`,
          )
        }
        if (type !== "markdown") requireCellWithinLineLimit(value)
        const cellId = ctrl.addCell(value, afterCellId, type)
        return Promise.resolve({ cellId })
      })
    },

    updateCell(bufferId, cellId, updates) {
      return bound(bufferId, (ctrl) => {
        const cell = requireCell(ctrl, cellId)
        if (cell.type !== "markdown" && updates.value !== undefined) {
          requireCellWithinLineLimit(updates.value)
        }
        ctrl.updateCell(cellId, updates)
        return Promise.resolve()
      })
    },

    deleteCell(bufferId, cellId) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        if (ctrl.getCellsSnapshot().length <= 1) {
          throw new NotebookToolError(
            "last_cell",
            `Cell ${cellId} is the only cell in notebook ${bufferId}; a notebook must keep at least one cell.`,
          )
        }
        ctrl.deleteCell(cellId)
        return Promise.resolve()
      })
    },

    moveCellUp(bufferId, cellId) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        ctrl.moveCellUp(cellId)
        return Promise.resolve()
      })
    },

    moveCellDown(bufferId, cellId) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        ctrl.moveCellDown(cellId)
        return Promise.resolve()
      })
    },

    duplicateCell(bufferId, cellId) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        if (ctrl.getCellsSnapshot().length >= MAX_NOTEBOOK_CELLS) {
          throw new NotebookToolError(
            "cell_limit",
            `Notebook ${bufferId} already has the maximum of ${MAX_NOTEBOOK_CELLS} cells. Delete a cell before duplicating another.`,
          )
        }
        const newId = ctrl.duplicateCell(cellId)
        return Promise.resolve({ cellId: newId })
      })
    },

    runCell(bufferId, cellId, signal, sql) {
      return withBoundNotebook(
        bufferId,
        async (ctrl) => {
          requireCell(ctrl, cellId)
          return ctrl.runCell(cellId, signal, sql)
        },
        signal ?? abortSignal,
      )
    },

    setLayoutMode(bufferId, mode) {
      return bound(bufferId, (ctrl) => {
        ctrl.setLayoutMode(mode)
        return Promise.resolve()
      })
    },

    setCellLayout(bufferId, cellId, x, y, w, h) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        ctrl.setCellLayout(cellId, { x, y, w, h })
        return Promise.resolve()
      })
    },

    setCellMode(bufferId, cellId, mode) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        ctrl.setCellMode(cellId, mode)
        return Promise.resolve()
      })
    },

    setCellChartConfig(bufferId, cellId, patch) {
      return bound(bufferId, (ctrl) => {
        const cell = requireCell(ctrl, cellId)
        // Merge into existing config so partial calls preserve xColumn/queries/etc.
        const base: ChartConfig = cell.chartConfig ?? {
          xColumn: null,
          queries: [],
        }
        const next: ChartConfig = { ...base, ...patch }
        ctrl.setCellChartConfig(cellId, next)
        return Promise.resolve()
      })
    },

    setCellAutoRefresh(bufferId, cellId, value) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        ctrl.setCellAutoRefresh(cellId, value)
        return Promise.resolve()
      })
    },

    setCellChartMaximized(bufferId, cellId, value) {
      return bound(bufferId, (ctrl) => {
        requireCell(ctrl, cellId)
        ctrl.setCellChartMaximized(cellId, value)
        return Promise.resolve()
      })
    },

    setCellMaximized(bufferId, cellId) {
      return bound(bufferId, (ctrl) => {
        if (cellId !== null) requireCell(ctrl, cellId)
        ctrl.setCellMaximized(cellId)
        return Promise.resolve()
      })
    },

    applyNotebookState(bufferId, request) {
      return bound(bufferId, (ctrl) => {
        const result = ctrl.applyNotebookState(request)
        return Promise.resolve(result)
      })
    },

    getCellSql(bufferId, cellId) {
      const controller = getController(bufferId)
      const meta = getWorkspace()?.getBufferMeta(bufferId)
      const cells = controller
        ? controller.getCellsSnapshot()
        : meta && (meta.kind === "active" || meta.kind === "inactive")
          ? meta.notebookViewState.cells
          : undefined
      const cell = cells?.find((c) => c.id === cellId)
      return cell ? cell.value : null
    },

    getCellType(bufferId, cellId) {
      const controller = getController(bufferId)
      const meta = getWorkspace()?.getBufferMeta(bufferId)
      const cells = controller
        ? controller.getCellsSnapshot()
        : meta && (meta.kind === "active" || meta.kind === "inactive")
          ? meta.notebookViewState.cells
          : undefined
      const cell = cells?.find((c) => c.id === cellId)
      if (!cell) return null
      return cell.type ?? "sql"
    },
  }
}

const MAX_RETRIES = 2
const RETRY_DELAY = 1000

let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000

const handleRateLimit = async () => {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest),
    )
  }
  lastRequestTime = Date.now()
}

const tryWithRetries = async <T>(
  fn: () => Promise<T>,
  provider: AIProvider,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal,
  isReplaySafe?: () => boolean,
): Promise<T | AiAssistantAPIError> => {
  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      return await fn()
    } catch (error) {
      console.error(
        "AI Assistant error:",
        error instanceof Error ? error.message : String(error),
        provider.isNonRetryableError(error)
          ? "Non-retryable error."
          : "Remaining retries: " + (MAX_RETRIES - retries) + ".",
      )
      retries++
      if (
        retries > MAX_RETRIES ||
        provider.isNonRetryableError(error) ||
        isReplaySafe?.() === false
      ) {
        return provider.classifyError(error, setStatus)
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  setStatus(null)
  return {
    type: "unknown",
    message: `Failed to get response after ${retries} retries`,
  }
}

export const testApiKey = async (
  apiKey: string,
  model: string,
  providerId: ProviderId,
  settings?: AiAssistantSettings,
): Promise<{ valid: boolean; error?: string }> => {
  const provider = createProvider(providerId, apiKey, settings)
  return provider.testConnection({ apiKey, model })
}

export const generateChatTitle = async ({
  firstUserMessage,
  settings,
}: {
  firstUserMessage: string
  settings: ActiveProviderSettings
}): Promise<string | null> => {
  const isCustom = !BUILTIN_PROVIDERS[settings.provider]
  if ((!isCustom && !settings.apiKey) || !settings.model) {
    return null
  }

  try {
    const provider = createProvider(
      settings.provider,
      settings.apiKey,
      settings.aiAssistantSettings,
    )

    const prompt = `Generate a concise chat title (max 30 characters) for this conversation. The title should capture the main topic or intent. Respond with ONLY the title text, nothing else.

User's message:
${firstUserMessage}`

    const raw = await provider.generateTitle({
      model: settings.model,
      prompt,
    })
    return (
      raw
        ?.trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 40) || null
    )
  } catch (error) {
    console.warn("Failed to generate chat title:", error)
    return null
  }
}

export type AIOperation =
  | "explain"
  | "fix"
  | "followup"
  | "schema_explain"
  | "health_issue"

export const continueConversation = async ({
  userMessage,
  conversationHistory,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
  streaming,
  notebookReadSeq,
}: {
  userMessage: string
  conversationHistory: Array<ConversationMessage>
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  conversationId?: ConversationId
  streaming?: StreamingCallback
  notebookReadSeq?: number
}): Promise<
  (GeneratedSQL | AiAssistantAPIError) & {
    compactedConversationHistory?: Array<ConversationMessage>
  }
> => {
  const isCustom = !BUILTIN_PROVIDERS[settings.provider]
  if ((!isCustom && !settings.apiKey) || !settings.model) {
    return {
      type: "invalid_key",
      message: "API key or model is missing",
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    }
  }

  let provider: ReturnType<typeof createProvider>
  try {
    provider = createProvider(
      settings.provider,
      settings.apiKey,
      settings.aiAssistantSettings,
    )
  } catch (error) {
    return {
      type: "unknown",
      message:
        error instanceof Error
          ? error.message
          : "Failed to initialize provider",
    }
  }

  const flowToolContext: ToolExecutionContext = {
    notebookReadSeq: notebookReadSeq ?? getUserActionSeq(),
  }

  return tryWithRetries(
    async () => {
      const grantSchemaAccess = !!modelToolsClient.getTables
      const aiPerms = settings.aiAssistantSettings
        ? getAiPermissions(settings.aiAssistantSettings)
        : { grantSchemaAccess: false, read: false, write: false }
      const systemPrompt = getUnifiedPrompt(grantSchemaAccess, {
        read: aiPerms.read,
        write: aiPerms.write,
      })

      let workingConversationHistory = conversationHistory
      let isCompacted = false

      if (conversationHistory.length > 0) {
        const compactionResult = await compactConversationIfNeeded(
          conversationHistory,
          provider,
          systemPrompt,
          userMessage,
          () => setStatus(AIOperationStatus.Compacting),
          {
            model: settings.model,
            aiAssistantSettings: settings.aiAssistantSettings,
          },
          abortSignal,
        )

        if (abortSignal?.aborted) {
          return {
            type: "aborted" as const,
            message: "Operation was cancelled",
          }
        }

        if ("error" in compactionResult) {
          setStatus(null)
          console.error(
            "Failed to compact conversation:",
            compactionResult.error,
          )
          return {
            type: "unknown" as const,
            message: compactionResult.error,
          }
        }

        if (compactionResult.wasCompacted) {
          const compactionTimestamp = Date.now()
          workingConversationHistory = [
            ...conversationHistory.map((m) => ({ ...m, isCompacted: true })),
            {
              id: crypto.randomUUID(),
              role: "user" as const,
              content: compactionResult.compactedMessage,
              hideFromUI: true,
              timestamp: compactionTimestamp,
            },
          ]
          isCompacted = true
          setStatus(AIOperationStatus.Processing)
        }
      }

      const tools = toolsForPermission(aiPerms, "ai")

      streaming?.onBeforeStream?.()

      const result = await provider.executeFlow({
        model: settings.model,
        config: {
          systemInstructions: systemPrompt,
          initialUserContent: userMessage,
          conversationHistory: toApiMessages(
            workingConversationHistory.filter((m) => !m.isCompacted),
          ),
        },
        modelToolsClient,
        tools,
        setStatus,
        abortSignal,
        streaming,
        perms: () => readLiveAiPermissions(aiPerms),
        validateSql: modelToolsClient.validateSqlRaw,
        toolContext: flowToolContext,
      })

      if (isAiAssistantError(result)) {
        return result
      }
      const sql = normalizeSql(result.sql ?? "") || null
      return {
        sql,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
        compactedConversationHistory: isCompacted
          ? workingConversationHistory
          : undefined,
      }
    },
    provider,
    setStatus,
    abortSignal,
    () => !flowToolContext.notebookMutated && !flowToolContext.sqlWriteExecuted,
  )
}
