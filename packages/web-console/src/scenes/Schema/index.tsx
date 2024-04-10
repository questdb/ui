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
  useEffect,
  useState,
  useContext,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import { from, combineLatest, of } from "rxjs"
import { delay, startWith } from "rxjs/operators"
import styled, { css } from "styled-components"
import { Loader3, Refresh, Search } from "@styled-icons/remix-line"

import {
  PaneContent,
  PaneWrapper,
  PopperHover,
  spinAnimation,
  Tooltip,
} from "../../components"
import { actions, selectors } from "../../store"
import { color, ErrorResult, isServerError } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import Table from "./Table"
import LoadingError from "./LoadingError"
import { Box } from "../../components/Box"
import { Button } from "@questdb/react-components"
import { Panel } from "../../components/Panel"
import { QuestContext } from "../../providers"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

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

const Schema = ({
  innerRef,
  ...rest
}: Props & { innerRef: Ref<HTMLDivElement> }) => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(false)
  const [loadingError, setLoadingError] = useState<ErrorResult | null>(null)
  const errorRef = useRef<ErrorResult | null>(null)
  const [tables, setTables ] = useState<QuestDB.Table[]>()
  const [walTables, setWalTables ] = useState<QuestDB.WalTable[]>()
  const [opened, setOpened] = useState<string>()
  const [isScrolling, setIsScrolling] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const { readOnly } = useSelector(selectors.console.getConfig)
  const dispatch = useDispatch()
  const [scrollAtTop, setScrollAtTop] = useState(true)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const handleChange = (name: string) => {
    setOpened(name === opened ? undefined : name)
  }

  const fetchTables = () => {
    setLoading(true)
    setOpened(undefined)
    combineLatest(
      from(quest.showTables()).pipe(startWith(null)),
      of(true).pipe(delay(1000), startWith(false)),
    ).subscribe(
      ([response]) => {
        if (response && response.type === QuestDB.Type.DQL) {
          setLoadingError(null)
          errorRef.current = null
          setTables(response.data)
          dispatch(actions.query.setTables(response.data))
        } else {
          setLoading(false)
        }
      },
      (error) => {
        if (isServerError(error)) {
          setLoadingError(error)
        }
      },
      () => {
        setLoading(false)
      },
    )
  }

  const fetchTablesAndWalTables = () => {
    fetchTables();
    fetchWalTables();
  }


  const fetchWalTables = () => {
    setLoading(true)
    setOpened(undefined)
    combineLatest(
      from(quest.showWalTables()).pipe(startWith(null)),
      of(true).pipe(delay(1000), startWith(false)),
    ).subscribe(
      ([response]) => {
        if (response && response.type === QuestDB.Type.DQL) {
          setLoadingError(null)
          errorRef.current = null
          setWalTables(response.data)
          dispatch(actions.query.setWalTables(response.data))
        } else {
          setLoading(false)
        }
      },
      (error) => {
        if (isServerError(error)) {
          setLoadingError(error)
        }
      },
      () => {
        setLoading(false)
      },
    )
  }

  useEffect(() => {
    void fetchTables()
    void fetchWalTables();

    eventBus.subscribe(EventType.MSG_QUERY_SCHEMA, () => {
      void fetchTables()
    })

    eventBus.subscribe<ErrorResult>(EventType.MSG_CONNECTION_ERROR, (error) => {
      if (error) {
        errorRef.current = error
        setLoadingError(error)
      }
    })

    eventBus.subscribe<ErrorResult>(EventType.MSG_CONNECTION_OK, () => {
      // The connection has been re-established, and we have an error in memory
      if (errorRef.current !== null) {
        void fetchTables()
      }
    })
  }, [])

  return (
    <Wrapper ref={innerRef} {...rest}>
      <Panel.Header
        title="Tables"
        afterTitle={
          <div style={{ display: "flex" }}>
            {readOnly === false && tables && (
              <Box align="center" gap="0">
                <PopperHover
                  delay={350}
                  placement="bottom"
                  trigger={
                    <Button onClick={fetchTablesAndWalTables} skin="transparent">
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
        ref={scrollerRef}
        onScroll={() => setScrollAtTop(scrollerRef?.current?.scrollTop === 0)}
      >
        {loading ? (
          <Loader size="48px" />
        ) : loadingError ? (
          <LoadingError error={loadingError} />
        ) : (
          tables?.map((table) => (
            <Table
              designatedTimestamp={table.designatedTimestamp}
              expanded={table.table_name === opened}
              isScrolling={isScrolling}
              key={table.table_name}
              table_name={table.table_name}
              onChange={handleChange}
              partitionBy={table.partitionBy}
              walEnabled={table.walEnabled}
              dedup={table.dedup}
            />
          ))
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
