/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { Download2, ResetGrid } from "../../components/icons"
import { MoveColumnToFront } from "../../components/icons"
import { TableFreezeColumn } from "../../components/icons"
import { Markdown } from "../../components/icons"
import { Check } from "../../components/icons"
import { ArrowDownS } from "../../components/icons"
import {
  Box,
  Button,
  PaneContent,
  PaneWrapper,
  PopperToggle,
  PrimaryToggleButton,
  Text,
  Tooltip,
  TOOLBAR_CONTROL_HEIGHT,
} from "../../components"
import { actions, selectors } from "../../store"
import { color, ErrorResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { ResultViewMode } from "scenes/Console/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { isSessionEnded } from "../../modules/OAuth2/session"
import { QuestContext } from "../../providers/QuestProvider"
import { LINE_NUMBER_HARD_LIMIT } from "../Editor/Monaco"
import { QueryInNotification } from "../Editor/Monaco/query-in-notification"
import { NotificationType, RunningType } from "../../store/Query/types"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { toast } from "../../components"
import { useQueryExecutionState } from "../../hooks/useQueryExecutionState"
import { downloadQueryResult } from "../../utils/downloadQueryResult"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  ResultGridAdapter,
  type ResultGridAdapterHandle,
} from "./ResultGridAdapter"
import { type PaginationFn } from "./usePagedDataSource"
import { ResultChart } from "./ResultChart"

const Root = styled.div`
  display: flex;
  flex: 1;
  width: 100%;
  background: ${({ theme }) => theme.color.surfaceRaised};
`

const Wrapper = styled(PaneWrapper)`
  overflow: hidden;
`

const Content = styled(PaneContent)`
  flex: 1 1 0;
  color: ${color("contentPrimary")};
  && {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: flex-end;
  padding: 0 1rem;
  width: 100%;
  height: 5.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  background: ${({ theme }) => theme.color.surfaceRaised};
`

const ResultCountBadge = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  align-items: baseline;
  gap: 0.4rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-family: ${({ theme }) => theme.font};
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 400;
  line-height: 1.56rem;
  white-space: nowrap;
`

const ResultCount = styled.span`
  color: ${({ theme }) => theme.color.contentPrimary};
  font-family: ${({ theme }) => theme.font};
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 600;
  line-height: 2.14rem;
  font-variant-numeric: tabular-nums;
`

const TableFreezeColumnIcon = styled(TableFreezeColumn)`
  transform: scaleX(-1);
`

const StyledPrimaryToggleButton = styled(PrimaryToggleButton).attrs({
  activeTone: "info" as const,
})`
  && {
    height: ${TOOLBAR_CONTROL_HEIGHT};
    min-height: ${TOOLBAR_CONTROL_HEIGHT};
    width: auto;
    min-width: ${TOOLBAR_CONTROL_HEIGHT};
    padding: 0 1.2rem;
  }
`

const DownloadButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
`

const ArrowIcon = styled(ArrowDownS)<{ $open: boolean }>`
  transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
`

const DownloadDropdownButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
`

const DownloadMenuItem = styled(Button)`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  width: 100%;
  height: 3rem;
  padding: 0 1rem;
`

const Result = ({ viewMode }: { viewMode: ResultViewMode }) => {
  const { quest } = useContext(QuestContext)
  const [count, setCount] = useState<number | undefined>()
  const result = useSelector(selectors.query.getResult)
  const running = useSelector(selectors.query.getRunning)
  const { active: activeQueryExecution } = useQueryExecutionState()
  const gridRef = useRef<ResultGridAdapterHandle | null>(null)
  const resultActionsRef = useRef<HTMLDivElement | null>(null)
  const runningRef = useRef(running)
  const [gridFrozenColumns, setGridFrozenColumns] = useState<number>(0)
  const [gridHasSelection, setGridHasSelection] = useState<boolean>(false)
  const [downloadMenuActive, setDownloadMenuActive] = useState<boolean>(false)
  const dispatch = useDispatch()

  // On a failed fetch it surfaces a notification and never calls the renderer,
  // leaving the failing page unloaded.
  const paginationFn = useCallback<PaginationFn>(
    async (sql, lo, hi, rendererFn) => {
      try {
        const result = await quest.queryRaw(sql, {
          limit: `${lo},${hi}`,
          nm: true,
          background: true,
        })
        if (result.type === QuestDB.Type.DQL) {
          rendererFn(result)
        }
      } catch (err) {
        // A page read interrupted by the end of the session has nothing to
        // report, and its notification would be read after signing in again.
        if (isSessionEnded(err)) return
        // Order of actions is important
        dispatch(
          actions.query.addNotification({
            query: `${sql}@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`,
            content: (
              <Text color="statusDanger">{(err as ErrorResult).error}</Text>
            ),
            sideContent: <QueryInNotification query={sql} />,
            type: NotificationType.ERROR,
            updateActiveNotification: true,
          }),
        )
        if (runningRef.current === RunningType.NONE) {
          dispatch(actions.query.stopRunning())
        }
      }
    },
    [],
  )

  useEffect(() => {
    runningRef.current = running
  }, [running])

  const handleYieldFocus = useCallback(
    () => eventBus.publish(EventType.MSG_EDITOR_FOCUS),
    [],
  )

  const dqlResult = result?.type === QuestDB.Type.DQL ? result : null

  const [isCopied, setIsCopied] = useState<boolean>(false)

  const gridActions = [
    {
      tooltipText: "Copy current page to Markdown",
      trigger: (
        <Button
          data-hook="grid-toolbar-markdown"
          variant="ghost"
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_MARKDOWN_COPY)
            void copyToClipboard(
              gridRef.current?.getResultAsMarkdown() ?? "",
            ).then(() => {
              setIsCopied(true)
              setTimeout(() => setIsCopied(false), 1000)
            })
          }}
        >
          {isCopied ? <Check size="18px" /> : <Markdown size="18px" />}
        </Button>
      ),
    },
    {
      tooltipText: "Freeze left column",
      trigger: (
        <StyledPrimaryToggleButton
          data-hook="grid-toolbar-freeze"
          // Keep the grid's keyboard focus and cell selection on the action.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_COLUMN_FREEZE)
            gridRef.current?.toggleFreezeLeft()
            gridRef.current?.focus()
          }}
          selected={gridFrozenColumns > 0}
        >
          <TableFreezeColumnIcon size="18px" />
        </StyledPrimaryToggleButton>
      ),
    },
    {
      tooltipText: "Move selected column to the front",
      trigger: (
        <Button
          data-hook="grid-toolbar-move-front"
          variant="ghost"
          disabled={!gridHasSelection}
          // Do not lose focus of the grid
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_COLUMN_MOVE_TO_FRONT)
            gridRef.current?.shuffleFocusedColumnToFront()
          }}
        >
          <MoveColumnToFront size="18px" weight="regular" />
        </Button>
      ),
    },
    {
      tooltipText: "Reset grid layout",
      trigger: (
        <Button
          data-hook="grid-toolbar-reset"
          variant="ghost"
          // Keep the grid's keyboard focus and cell selection on the action.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_LAYOUT_RESET)
            gridRef.current?.resetLayout()
          }}
        >
          <ResetGrid size="18px" weight="regular" />
        </Button>
      ),
    },
    {
      tooltipText: "Re-run query",
      trigger: (
        <Button
          data-hook="grid-toolbar-refresh"
          variant="ghost"
          disabled={activeQueryExecution !== null}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_REFRESH)
            const sql = gridRef.current?.getSQL()
            if (sql) {
              eventBus.publish(EventType.MSG_QUERY_EXEC, { q: sql })
            }
          }}
        >
          <ArrowClockwiseIcon size="18px" weight="regular" />
        </Button>
      ),
    },
  ]

  useEffect(() => {
    if (result?.type === QuestDB.Type.DQL) {
      setCount(result.count)
    }
  }, [result])

  const handleDownload = (format: "csv" | "parquet") => {
    void trackEvent(
      format === "parquet"
        ? ConsoleEvent.GRID_PARQUET_DOWNLOAD
        : ConsoleEvent.GRID_CSV_DOWNLOAD,
    )
    setDownloadMenuActive(false)
    const sql = gridRef.current?.getSQL()
    if (!sql) {
      toast.error("No SQL query found to download")
      return
    }

    downloadQueryResult(sql, format)
  }

  const focusResultActions = () => {
    resultActionsRef.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus()
  }

  return (
    <Root>
      <Wrapper>
        <Actions ref={resultActionsRef}>
          {count !== undefined && (
            <ResultCountBadge
              aria-label={`${count.toLocaleString()} ${count === 1 ? "row" : "rows"}`}
            >
              <ResultCount>{count.toLocaleString()}</ResultCount>
              {count === 1 ? "row" : "rows"}
            </ResultCountBadge>
          )}
          {viewMode === "grid" &&
            gridActions.map((action) => (
              <Tooltip
                key={action.tooltipText}
                delay={350}
                placement="bottom"
                content={action.tooltipText}
              >
                {React.cloneElement(action.trigger, {
                  "aria-label": action.tooltipText,
                })}
              </Tooltip>
            ))}

          <Box gap="0">
            <DownloadButton
              variant="secondary"
              data-hook="download-parquet-button"
              onClick={() => handleDownload("parquet")}
            >
              <Box align="center" gap="0.5rem" style={{ lineHeight: "1.285" }}>
                <Download2 height="18px" width="18px" />
                Download as Parquet
              </Box>
            </DownloadButton>
            <PopperToggle
              active={downloadMenuActive}
              onToggle={setDownloadMenuActive}
              placement="bottom-end"
              modifiers={[
                {
                  name: "offset",
                  options: {
                    offset: [0, 4],
                  },
                },
              ]}
              trigger={
                <DownloadDropdownButton
                  variant="secondary"
                  data-hook="download-dropdown-button"
                  aria-label={
                    downloadMenuActive
                      ? "Close download options"
                      : "Open download options"
                  }
                  aria-expanded={downloadMenuActive}
                >
                  <ArrowIcon size="18px" $open={downloadMenuActive} />
                </DownloadDropdownButton>
              }
            >
              <DownloadMenuItem
                data-hook="download-csv-button"
                variant="secondary"
                onClick={() => handleDownload("csv")}
              >
                Download as CSV
              </DownloadMenuItem>
            </PopperToggle>
          </Box>
        </Actions>

        <Content>
          <ResultGridAdapter
            ref={gridRef}
            result={dqlResult}
            visible={viewMode === "grid"}
            paginationFn={paginationFn}
            onSelectionChange={setGridHasSelection}
            onYieldFocus={handleYieldFocus}
            onFrozenColumnsChange={setGridFrozenColumns}
          />

          <ResultChart
            result={dqlResult}
            visible={viewMode === "chart"}
            onResetZoomFocus={focusResultActions}
          />
        </Content>
      </Wrapper>
    </Root>
  )
}

export default Result
