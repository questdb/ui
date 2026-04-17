import React from "react"
import { Text } from "../components"
import { QueryInNotification } from "../scenes/Editor/Monaco/query-in-notification"
import QueryResult from "../scenes/Editor/QueryResult"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { NotificationType } from "../store/Query/types"
import type {
  NotificationNamespaceKey,
  QueryKey,
  QueryAction,
} from "../store/Query/types"
import type { Client } from "./questdb/client"
import * as QuestDB from "./questdb"
import type { ExecutionRefs } from "../scenes/Editor/index"
import type { Dispatch } from "redux"
import actions from "../store/Query/actions"

export type RunDetachedQueryConfig = {
  normalizedSQL: string
  queryKey: QueryKey
  namespaceKey: NotificationNamespaceKey
  quest: Client
  dispatch: Dispatch<QueryAction>
  executionRefs: React.MutableRefObject<ExecutionRefs>
  releaseExecution: (queryKey: QueryKey) => void
  onSettled?: () => void
}

export async function runDetachedQuery(
  config: RunDetachedQueryConfig,
): Promise<void> {
  const {
    normalizedSQL,
    queryKey,
    namespaceKey,
    quest,
    dispatch,
    executionRefs,
    releaseExecution,
  } = config

  const { promise } = quest.queryRaw(normalizedSQL, {
    limit: "0,1000",
    explain: true,
    cancellable: true,
  })

  try {
    const result = await promise

    if (!executionRefs.current[namespaceKey]) {
      executionRefs.current[namespaceKey] = {}
    }
    executionRefs.current[namespaceKey][queryKey] = {
      success: true,
      queryText: normalizedSQL,
      startOffset: -1,
      endOffset: -1,
    }

    dispatch(actions.setResult(result))

    if (result.type === QuestDB.Type.DDL || result.type === QuestDB.Type.DML) {
      dispatch(
        actions.addNotification(
          {
            query: queryKey,
            content: <QueryInNotification query={normalizedSQL} />,
          },
          namespaceKey,
        ),
      )
      eventBus.publish(EventType.MSG_QUERY_SCHEMA)
      return
    }

    if (result.type === QuestDB.Type.NOTICE) {
      dispatch(
        actions.addNotification(
          {
            query: queryKey,
            content: (
              <Text color="foreground" ellipsis title={normalizedSQL}>
                {result.notice}
                {normalizedSQL !== "" ? `: ${normalizedSQL}` : ""}
              </Text>
            ),
            type: NotificationType.NOTICE,
            sideContent: <QueryInNotification query={normalizedSQL} />,
          },
          namespaceKey,
        ),
      )
      eventBus.publish(EventType.MSG_QUERY_SCHEMA)
      return
    }

    if (result.type === QuestDB.Type.DQL) {
      dispatch(
        actions.addNotification(
          {
            query: queryKey,
            jitCompiled: result.explain?.jitCompiled ?? false,
            content: (
              <QueryResult {...result.timings} rowCount={result.count} />
            ),
            sideContent: <QueryInNotification query={normalizedSQL} />,
          },
          namespaceKey,
        ),
      )
      eventBus.publish(EventType.MSG_QUERY_DATASET, result)
    }
  } catch (_error: unknown) {
    const error = _error as {
      error?: string
      message?: string
      position?: number
    }

    if (!executionRefs.current[namespaceKey]) {
      executionRefs.current[namespaceKey] = {}
    }
    executionRefs.current[namespaceKey][queryKey] = {
      success: false,
      queryText: normalizedSQL,
      startOffset: -1,
      endOffset: -1,
    }

    dispatch(
      actions.addNotification(
        {
          query: queryKey,
          content: (
            <Text color="red">
              {error.error || error.message || "Query execution failed"}
            </Text>
          ),
          type: NotificationType.ERROR,
          sideContent: <QueryInNotification query={normalizedSQL} />,
        },
        namespaceKey,
      ),
    )
  } finally {
    config.onSettled?.()
    releaseExecution(queryKey)
  }
}
