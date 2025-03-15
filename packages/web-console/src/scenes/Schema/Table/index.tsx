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
import { ErrorWarning } from '@styled-icons/remix-line'
import { Tree, collapseTransition } from "../../../components"
import { TreeNode, TreeNodeRenderParams, Text } from "../../../components"
import { ContextMenuTrigger } from "../../../components/ContextMenu"
import { color } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import Row from "../Row"
import { useSelector, useDispatch } from "react-redux"
import { actions, selectors } from "../../../store"
import { QuestContext } from "../../../providers"
import { NotificationType } from "../../../types"
import { CopyButton } from '../../../components/CopyButton'
import { IconWithTooltip } from '../../../components'

type Props = QuestDB.Table &
  Readonly<{
    designatedTimestamp: string
    description?: string
    id: number
    table_name: string
    partitionBy: string
    expanded?: boolean
    onChange: (name: string) => void
    walTableData?: QuestDB.WalTable
    matViewData?: QuestDB.MaterializedView
    baseTableExists?: boolean
    selected: boolean
    selectOpen: boolean
    onSelectToggle: (table_name: string) => void
}>

const Wrapper = styled.div`
  position: relative;
  display: flex;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
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

const SuffixWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  button {
    border: 0;
    height: 100%;
    padding: 0.3rem 0.3rem;

    svg {
      height: 1.3rem;
    }
  }
`

const WarningIcon = styled(ErrorWarning)`
  color: ${color("orange")};
  height: 1.9rem;
`

const columnRender =
  ({
    table_id,
    column,
    designatedTimestamp,
  }: {
    table_id: number
    column: QuestDB.Column
    designatedTimestamp: string
  }) =>
  ({ toggleOpen }: TreeNodeRenderParams) =>
    (
      <Row
        {...column}
        designatedTimestamp={designatedTimestamp}
        table_id={table_id}
        kind="column"
        name={column.column}
        onClick={() => toggleOpen()}
      />
    )

const Table = ({
  description,
  designatedTimestamp,
  id,
  table_name,
  partitionBy,
  ttlValue,
  ttlUnit,
  expanded = false,
  walEnabled,
  walTableData,
  matViewData,
  onChange,
  dedup,
  selected,
  selectOpen,
  onSelectToggle,
  matView,
  baseTableExists,
}: Props) => {
  const { quest } = useContext(QuestContext)
  const [columns, setColumns] = useState<QuestDB.Column[]>()
  const tables = useSelector(selectors.query.getTables)
  const dispatch = useDispatch()

  const showColumns = async (name: string) => {
    try {
      const response = await quest.showColumns(name)
      if (response && response.type === QuestDB.Type.DQL) {
        return response
      }
    } catch (error: any) {
      dispatch(
        actions.query.addNotification({
          content: (
            <Text color="red">Cannot show columns from table '{name}'</Text>
          ),
          type: NotificationType.ERROR,
        }),
      )
    }
  }

  const showMatViewDDL = async (name: string) => {
    try {
      const response = await quest.showMatViewDDL(name)
      if (response && response.type === QuestDB.Type.DQL) {
        return response
      }
    } catch (error: any) {
      dispatch(
        actions.query.addNotification({
          content: (
            <Text color="red">Cannot show DDL for materialized view '{name}'</Text>
          ),
          type: NotificationType.ERROR,
        }),
      )
    }
  }

  useEffect(() => {
    const fetchColumns = async () => {
      if (tables && expanded && table_name) {
        const response = await showColumns(table_name)
        if (response && response.data) {
          setColumns(response.data)
        }
      }
    }
    fetchColumns()
  }, [tables, table_name])

  const tree: TreeNode[] = [
    {
      name: table_name,
      kind: "table",
      initiallyOpen: expanded,
      async onOpen({ setChildren }) {
        const columns: TreeNode = {
          name: "Columns",
          initiallyOpen: true,
          wrapper: Columns,
          async onOpen({ setChildren }) {
            onChange(table_name)
            const response = await showColumns(table_name)

            if (response && response.data && response.data.length > 0) {
              setColumns(response.data)

              setChildren(
                response.data.map((column) => ({
                  name: column.column,
                  render: columnRender({
                    column,
                    designatedTimestamp,
                    table_id: id,
                  }),
                })),
              )
            } else {
              setChildren([
                {
                  name: "error",
                  render: () => <Text color="gray2">No columns found</Text>,
                },
              ])
            }
          },
          render({ toggleOpen, isOpen, isLoading }) {
            return (
              <Row
                expanded={isOpen && !isLoading}
                kind="folder"
                table_id={id}
                name="Columns"
                onClick={() => toggleOpen()}
                isLoading={isLoading}
              />
            )
          },
        }
        const children: TreeNode[] = []

        if (matView && matViewData) {
          children.push({
            name: "Base table",
            render: () => (
              <Row
                table_id={id}
                kind="info"
                name="Base table"
                value={matViewData?.base_table_name}
                suffix={!baseTableExists && (
                  <SuffixWrapper data-hook="base-table-warning">
                    <IconWithTooltip
                      icon={<WarningIcon />}
                      placement="top"
                      tooltip="Base table has been dropped"
                    />
                  </SuffixWrapper>
                )}
              />
            )
          })

          const response = await showMatViewDDL(table_name)
          if (response && response.data && response.data.length > 0) {
            children.push({
              name: "DDL",
              render: () => (
                <Row
                  table_id={id}
                  kind="info"
                  name="Query"
                  value={response.data[0].ddl}
                  copyable={true}
                  suffix={
                    <SuffixWrapper>
                      <CopyButton text={response.data[0].ddl} iconOnly={true} />
                    </SuffixWrapper>
                  }
                />
              )
            })
          }
        }
        setChildren([...children, columns])
      },
      render({ toggleOpen, isLoading }) {
        return (
          // @ts-ignore
          <ContextMenuTrigger id={table_name}>
            <Title
              description={description}
              kind="table"
              table_id={id}
              name={table_name}
              onClick={() => {
                toggleOpen()
                onChange(table_name)
              }}
              partitionBy={partitionBy}
              walEnabled={walEnabled}
              walTableData={walTableData}
              isLoading={isLoading}
              tooltip={!!description}
              selectOpen={selectOpen}
              selected={selected}
              onSelectToggle={onSelectToggle}
            />
          </ContextMenuTrigger>
        )
      },
    },
  ]

  return (
    <Wrapper _height={columns ? columns.length * 30 : 0}>
      <Tree root={tree} />
    </Wrapper>
  )
}

export default Table
