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

import React, { forwardRef, Ref, useCallback, useEffect, useState } from "react"
import styled from "styled-components"

import { Key, Text } from "../../../components"
import { menuContainerStyles } from "../../../components/menuStyles"
import { useKeyPress } from "../../../hooks"

import QueryRow from "./Row"
import { useEditor } from "../../../providers"
import { Query, QueryGroup } from "providers/SettingsProvider/types"

type Props = {
  hidePicker: () => void
  queries: Array<Query | QueryGroup>
  ref: Ref<HTMLDivElement>
}

const Wrapper = styled.div`
  ${menuContainerStyles}

  width: min(60rem, calc(100vw - 2rem));
  max-height: min(65rem, calc(100vh - 6rem));
  overflow-y: auto;
`

const Helper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  padding: 0.4rem 0.8rem 0.8rem;
  margin-bottom: 0.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
`

const HelperGroup = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`

type QueryListItem =
  | { type: "query"; id: number; data: Query }
  | { type: "descriptor"; id: number; data: QueryGroup }

const prepareQueriesList = (queries: Props["queries"]) => {
  const queue = [...queries]
  const list: QueryListItem[] = []

  let id = 0
  while (queue.length) {
    const current = queue.shift()

    if (typeof (current as QueryGroup).queries === "undefined") {
      list.push({
        type: "query",
        id,
        data: current as Query,
      })
    } else {
      const data = current as QueryGroup
      list.push({
        type: "descriptor",
        id,
        data,
      })
      queue.unshift(...data.queries)
    }
    id++
  }

  return list
}

const isQuery = ({ type }: QueryListItem) => type === "query"

const GroupHeader = styled.div`
  padding: 1rem 0.8rem 0.7rem;
  margin-top: 0.4rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Title = styled(Text)`
  display: block;
  margin-bottom: 0.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  font-weight: 600;
`

const Description = styled(Text)`
  display: block;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  line-height: 1.45;
`

const QueryPicker = ({ hidePicker, queries, ref }: Props) => {
  const downPress = useKeyPress("ArrowDown")
  const upPress = useKeyPress("ArrowUp")
  const enterPress = useKeyPress("Enter")
  const [cursor, setCursor] = useState<number>(-1)
  const [queryList, setQueryList] = useState<
    ReturnType<typeof prepareQueriesList>
  >([])
  const { appendQuery } = useEditor()

  useEffect(() => {
    setQueryList(prepareQueriesList(queries))
  }, [queries])

  const addQuery = useCallback(
    (query: Query) => {
      hidePicker()
      appendQuery(query.value)
    },
    [hidePicker],
  )

  useEffect(() => {
    if (queryList.length) {
      if (downPress) {
        const firstQueryIndex = queryList.find(isQuery)?.id ?? 0
        const nextIndex =
          queryList.slice(cursor + 1).find(isQuery)?.id ?? firstQueryIndex
        setCursor(nextIndex)
      }

      if (upPress) {
        const reversedList = [...queryList].reverse()
        const lastQueryIndex =
          reversedList.find(isQuery)?.id ?? queryList.length - 1

        const prevIndex =
          [...queryList].slice(0, cursor).reverse().find(isQuery)?.id ??
          lastQueryIndex
        setCursor(prevIndex)
      }
    }
  }, [upPress, downPress, queryList])

  useEffect(() => {
    if (enterPress) {
      const query = queryList.find(
        ({ id, type }) => id === cursor && type === "query",
      )
      if (query) {
        addQuery(query.data as Query)
      }
    }
  }, [cursor, enterPress, hidePicker, queries, addQuery])

  return (
    <Wrapper ref={ref}>
      <Helper>
        <HelperGroup>
          Navigate
          <Key keyString="↑" />
          <Key keyString="↓" />
        </HelperGroup>
        <HelperGroup>
          Close
          <Key keyString="Esc" />
        </HelperGroup>
      </Helper>

      {queryList.map((entry) => {
        if (entry.type === "query") {
          const query = entry.data
          return (
            <QueryRow
              active={entry.id === cursor}
              hidePicker={hidePicker}
              key={entry.id}
              onClick={() => addQuery(query)}
              onMouseEnter={() => setCursor(entry.id)}
              onMouseLeave={() => setCursor(-1)}
              query={query}
            />
          )
        }

        const { title, description } = entry.data
        return (
          <GroupHeader key={entry.id}>
            <Title>{title}</Title>
            <Description>{description}</Description>
          </GroupHeader>
        )
      })}
    </Wrapper>
  )
}

const QueryPickerWithRef = (props: Props, ref: Ref<HTMLDivElement>) => (
  <QueryPicker {...props} ref={ref} />
)

export default forwardRef(QueryPickerWithRef)
