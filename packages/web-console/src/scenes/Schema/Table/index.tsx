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

import React, { useContext, useEffect, useState } from "react"
import styled from "styled-components"
import { Loader4 } from "@styled-icons/remix-line"
import { Tree, collapseTransition, spinAnimation } from "../../../components"
import type { TreeNode, TreeNodeRenderParams } from "../../../components"
import { ContextMenuTrigger } from "../../../components/ContextMenu"
import { color } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import Row from "../Row"
import ContextualMenu from "./ContextualMenu"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { QuestContext } from "../../../providers"

type Props = QuestDB.Table &
  Readonly<{
    designatedTimestamp: string
    description?: string
    isScrolling: boolean
    table_name: string
    partitionBy: string
    expanded?: boolean
    onChange: (name: string) => void
    walTableData?: QuestDB.WalTable
  }>

const Wrapper = styled.div`
  position: relative;
  display: flex;
  margin-top: 0.5rem;
  align-items: stretch;
  flex-direction: column;
  overflow: hidden;
  font-family: ${({ theme }) => theme.fontMonospace};

  ${collapseTransition};
`

const Title = styled(Row)`
  display: flex;
  align-items: stretch;
  font-weight: ${({ expanded }) => (expanded ? 800 : 400)};

  &:hover {
    cursor: pointer;
  }
`

const Columns = styled.div`
  position: relative;
  display: flex;
  margin-left: 2rem;
  flex-direction: column;

  &:before {
    position: absolute;
    height: 100%;
    width: 2px;
    left: -0.4rem;
    top: 0;
    content: "";
    background: ${color("gray1")};
  }
`

const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("orange")};
  ${spinAnimation};
`

const columnRender =
  ({
    column,
    designatedTimestamp,
  }: {
    column: QuestDB.Column
    designatedTimestamp: string
  }) =>
  ({ toggleOpen }: TreeNodeRenderParams) =>
    (
      <Row
        {...column}
        designatedTimestamp={designatedTimestamp}
        kind="column"
        name={column.column}
        onClick={() => toggleOpen()}
      />
    )

const Table = ({
  description,
  isScrolling,
  designatedTimestamp,
  table_name,
  partitionBy,
  expanded = false,
  walEnabled,
  walTableData,
  onChange,
  dedup,
}: Props) => {
  const { quest } = useContext(QuestContext)
  const [columns, setColumns] = useState<QuestDB.Column[]>()
  const tables = useSelector(selectors.query.getTables)

  const showColumns = async (name: string) => {
    const response = await quest.showColumns(table_name)
    if (response && response.type === QuestDB.Type.DQL) {
      setColumns(response.data)
    }
  }

  useEffect(() => {
    if (tables && expanded && table_name) {
      void showColumns(table_name)
    }
  }, [tables, table_name])

  const tree: TreeNode[] = [
    {
      name: table_name,
      kind: "table",
      initiallyOpen: expanded,
      children: [
        {
          name: "Columns",
          initiallyOpen: true,
          wrapper: Columns,
          async onOpen({ setChildren }) {
            onChange(table_name)
            const response = (await quest.showColumns(table_name)) ?? []

            if (response && response.type === QuestDB.Type.DQL) {
              setColumns(response.data)

              setChildren(
                response.data.map((column) => ({
                  name: column.column,
                  render: columnRender({ column, designatedTimestamp }),
                })),
              )
            }
          },

          render({ toggleOpen, isOpen, isLoading }) {
            return (
              <Row
                expanded={isOpen && !isLoading}
                kind="folder"
                name="Columns"
                onClick={() => toggleOpen()}
                suffix={isLoading && <Loader size="18px" />}
              />
            )
          },
        },
      ],

      render({ toggleOpen, isLoading }) {
        return (
          // @ts-ignore
          <ContextMenuTrigger id={table_name}>
            <Title
              description={description}
              kind="table"
              name={table_name}
              onClick={() => {
                toggleOpen()
                onChange(table_name)
              }}
              partitionBy={partitionBy}
              walEnabled={walEnabled}
              walTableData={walTableData}
              suffix={isLoading && <Loader size="18px" />}
              tooltip={!!description}
            />
          </ContextMenuTrigger>
        )
      },
    },
  ]

  return (
    <Wrapper _height={columns ? columns.length * 30 : 0}>
      {!isScrolling && (
        <ContextualMenu
          name={table_name}
          partitionBy={partitionBy}
          walEnabled={walEnabled}
          dedup={dedup}
        />
      )}

      <Tree root={tree} />
    </Wrapper>
  )
}

export default Table
