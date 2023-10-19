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
  CSSProperties,
  forwardRef,
  Ref,
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import { from, combineLatest, of } from "rxjs"
import { delay, startWith } from "rxjs/operators"
import styled, { css } from "styled-components"
import { Loader3, Refresh } from "@styled-icons/remix-line"

import {
  PaneContent,
  PaneWrapper,
  PopperHover,
  spinAnimation,
  Tooltip,
  VirtualList,
} from "../../components"
import { actions, selectors } from "../../store"
import { color, ErrorResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import Table from "./Table"
import LoadingError from "./LoadingError"
import { BusEvent } from "../../consts"
import { Box } from "../../components/Box"
import { Button } from "@questdb/react-components"
import { Panel } from "../../components/Panel"

type Props = Readonly<{
  hideMenu?: boolean
  style?: CSSProperties
}>

const loadingStyles = css`
  display: flex;
  justify-content: center;
`

const Wrapper = styled(PaneWrapper)`
  overflow-x: auto;
  height: 100%;
`

const Content = styled(PaneContent)<{
  _loading: boolean
}>`
  display: block;
  font-family: ${({ theme }) => theme.fontMonospace};
  overflow: auto;
  ${({ _loading }) => _loading && loadingStyles};
`

const Loader = styled(Loader3)`
  margin-left: 1rem;
  align-self: center;
  color: ${color("foreground")};
  ${spinAnimation};
`

const FlexSpacer = styled.div`
  flex: 1;
`

const VIRTUAL_SCROLL_THRESHOLD = 200

const Schema = ({
  innerRef,
  ...rest
}: Props & { innerRef: Ref<HTMLDivElement> }) => {
  const [quest] = useState(new QuestDB.Client())
  const [loading, setLoading] = useState(false)
  const [loadingError, setLoadingError] = useState<ErrorResult | null>(null)
  const errorRef = useRef<ErrorResult | null>(null)
  const [tables, setTables] = useState<QuestDB.Table[]>()
  const [opened, setOpened] = useState<string>()
  const [refresh, setRefresh] = useState(Date.now())
  const [isScrolling, setIsScrolling] = useState(false)
  const { readOnly } = useSelector(selectors.console.getConfig)
  const dispatch = useDispatch()
  const [scrollAtTop, setScrollAtTop] = useState(true)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const handleChange = useCallback((name: string) => {
    setOpened(name)
  }, [])

  const renderTable = (table: QuestDB.Table) => (
    <Table
      designatedTimestamp={table.designatedTimestamp}
      expanded={table.name === opened}
      isScrolling={isScrolling}
      key={table.name}
      name={table.name}
      onChange={handleChange}
      partitionBy={table.partitionBy}
      refresh={refresh}
      walEnabled={table.walEnabled}
    />
  )

  const listItemContent = useCallback(
    (index: number) => {
      if (tables) {
        const table = tables[index]
        return renderTable(table)
      }
    },
    [handleChange, isScrolling, opened, refresh, tables],
  )

  const fetchTables = useCallback(() => {
    setLoading(true)
    combineLatest(
      from(quest.showTables()).pipe(startWith(null)),
      of(true).pipe(delay(1000), startWith(false)),
    ).subscribe(
      ([response, loading]) => {
        if (response && response.type === QuestDB.Type.DQL) {
          setLoadingError(null)
          errorRef.current = null
          setTables(response.data)
          dispatch(actions.query.setTables(response.data))
          setRefresh(Date.now())
        } else {
          setLoading(false)
        }
      },
      (error) => {
        setLoadingError(error)
      },
      () => {
        setLoading(false)
      },
    )
  }, [quest])

  useEffect(() => {
    void fetchTables()

    window.bus.on(BusEvent.MSG_QUERY_SCHEMA, () => {
      void fetchTables()
    })

    window.bus.on(
      BusEvent.MSG_CONNECTION_ERROR,
      (_event, error: ErrorResult) => {
        errorRef.current = error
        setLoadingError(error)
      },
    )

    window.bus.on(BusEvent.MSG_CONNECTION_OK, () => {
      // The connection has been re-established, as we have an error in memory
      if (errorRef.current) {
        void fetchTables()
      }
    })
  }, [errorRef, fetchTables])

  useEffect(() => {
    if (tables && tables?.length >= VIRTUAL_SCROLL_THRESHOLD) {
      setScrollAtTop(scrollerRef.current?.scrollTop === 0)
    }
  }, [isScrolling, tables])

  return (
    <Wrapper ref={innerRef} {...rest}>
      <Panel.Header
        title="Tables"
        afterTitle={
          <div style={{ display: "flex" }}>
            {readOnly === false && tables && (
              <Box align="center" gap="1rem">
                <PopperHover
                  delay={350}
                  placement="bottom"
                  trigger={
                    <Button onClick={fetchTables} skin="transparent">
                      <Refresh size="18px" />
                    </Button>
                  }
                >
                  <Tooltip>Refresh</Tooltip>
                </PopperHover>
              </Box>
            )}
          </div>
        }
        shadow={!scrollAtTop}
      />
      <Content
        _loading={loading}
        {...(tables &&
          tables?.length < VIRTUAL_SCROLL_THRESHOLD && {
            ref: scrollerRef,
            onScroll: () => {
              setScrollAtTop(scrollerRef?.current?.scrollTop === 0)
            },
          })}
      >
        {loading ? (
          <Loader size="48px" />
        ) : loadingError ? (
          <LoadingError error={loadingError} />
        ) : tables && tables?.length >= VIRTUAL_SCROLL_THRESHOLD ? (
          <VirtualList
            isScrolling={setIsScrolling}
            itemContent={listItemContent}
            totalCount={tables?.length}
            scrollerRef={(ref) => (scrollerRef.current = ref as HTMLDivElement)}
          />
        ) : (
          tables && tables?.map(renderTable)
        )}
        {!loading && <FlexSpacer />}
      </Content>
    </Wrapper>
  )
}

const SchemaWithRef = (props: Props, ref: Ref<HTMLDivElement>) => (
  <Schema {...props} innerRef={ref} />
)

export default forwardRef(SchemaWithRef)
