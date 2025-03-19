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

import React, { MouseEvent, useContext, useState, useEffect, useRef } from "react"
import styled from "styled-components"
import { Rocket } from "@styled-icons/boxicons-regular"
import { SortDown } from "@styled-icons/boxicons-regular"
import { ChevronRight } from "@styled-icons/boxicons-solid"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { CheckboxBlankCircle, Loader4 } from "@styled-icons/remix-line"
import type { TreeNodeKind } from "../../../components/Tree"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon } from "../table-icon"
import { Box } from "@questdb/react-components"
import { Text, TransitionDuration, IconWithTooltip, spinAnimation } from "../../../components"
import type { TextProps } from "../../../components"
import { color } from "../../../utils"
import { SchemaContext } from "../SchemaContext"
import { Checkbox } from "../checkbox"
import { PopperHover } from "../../../components/PopperHover"
import { Tooltip } from "../../../components/Tooltip"

type Props = Readonly<{
  className?: string
  designatedTimestamp?: string
  expanded?: boolean
  indexed?: boolean
  kind: TreeNodeKind
  table_id?: number
  name: string
  onClick?: (event: MouseEvent) => void
  "data-hook"?: string
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  isLoading?: boolean
  type?: string
  selectOpen?: boolean
  selected?: boolean
  onSelectToggle?: ({name, type}: {name: string, type: TreeNodeKind}) => void
  baseTable?: string
  errors?: string[]
}>

const Type = styled(Text)`
  display: flex;
  align-items: center;
  flex: 0;
  transition: opacity ${TransitionDuration.REG}ms;
`

const Title = styled(Text)<TextProps & { kind: TreeNodeKind }>`
  cursor: ${({ kind }) => 
    ["folder", "table", "matview"].includes(kind) ? "pointer" : "initial"};

  .highlight {
    background-color: #7c804f;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  padding-left: 1rem;
  padding-right: 1rem;
  transition: background ${TransitionDuration.REG}ms;

  &:hover,
  &:active {
    background: ${color("selection")};
  }
`

const StyledTitle = styled(Title)`
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 1;
  flex-shrink: 0;
  margin-right: 1rem;

  mark {
    background-color: #45475a !important;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const TableActions = styled.span`
  z-index: 1;
  position: relative;
`

const FlexRow = styled.div<{ $selectOpen?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  transform: translateX(${({ $selectOpen }) => ($selectOpen ? "26px" : "0")});
  transition: transform 275ms ease-in-out;
`

const Spacer = styled.span`
  flex: 1;
`

const RocketIcon = styled(Rocket)`
  color: ${color("orange")};
  margin-right: 1rem;
`

const SortDownIcon = styled(SortDown)`
  color: ${color("green")};
  margin-right: 0.8rem;
`

const ChevronRightIcon = styled(ChevronRight)`
  color: ${color("gray2")};
  margin-right: 0.8rem;
  cursor: pointer;
  flex-shrink: 0;
  width: 1.5rem;
`

const ChevronDownIcon = styled(ChevronRightIcon)`
  transform: rotateZ(90deg);
`

const DotIcon = styled(CheckboxBlankCircle)`
  color: ${color("gray2")};
  margin-right: 1rem;
`

const TruncatedBox = styled(Box)`
  display: inline;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  cursor: default;
  font-style: italic;
  color: ${color("gray2")};
  text-align: right;
`

const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("orange")};
  ${spinAnimation};
`

const ErrorIconWrapper = styled.div`
  display: inline;
  align-self: center;

  svg {
    color: #f47474;
  }
`

const ErrorItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const Row = ({
  className,
  designatedTimestamp,
  expanded,
  kind,
  indexed,
  table_id,
  name,
  partitionBy,
  walEnabled,
  onClick,
  "data-hook": dataHook,
  isLoading,
  type,
  selectOpen,
  selected,
  onSelectToggle,
  baseTable,
  errors,
}: Props) => {
  const { query } = useContext(SchemaContext)
  const [showLoader, setShowLoader] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isExpandable = ["folder", "table", "matview"].includes(kind)
  const isTableKind = ["table", "matview"].includes(kind)

  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        setShowLoader(true)
      }, 500)
    } else {
      setShowLoader(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isLoading])

  return (
    <Wrapper
      data-hook={dataHook ?? "schema-row"}
      className={className}
      onClick={(e) => {
        if (isTableKind && selectOpen && onSelectToggle) {
          onSelectToggle({name, type: kind})
        } else {
          onClick?.(e)
        }
      }}
    >
      <Box
        align="center"
        justifyContent="flex-start"
        gap="2rem"
        style={{ width: "100%", position: "relative" }}
      >
        {isTableKind && (
          <div style={{ position: "absolute" }}>
            <Checkbox
              visible={selectOpen && onSelectToggle !== undefined}
              checked={selected}
            />
          </div>
        )}
        <FlexRow $selectOpen={selectOpen}>
          {isExpandable && expanded && <ChevronDownIcon size="14px" />}
          {isExpandable && !expanded && <ChevronRightIcon size="14px" />}

          {kind === "column" && indexed && (
            <IconWithTooltip
              icon={<RocketIcon size="13px" />}
              placement="top"
              tooltip="Indexed"
            />
          )}

          {kind === "column" && !indexed && name === designatedTimestamp && (
            <IconWithTooltip
              icon={<SortDownIcon size="14px" />}
              placement="top"
              tooltip="Designated timestamp"
            />
          )}

          {kind === "column" && !indexed && name !== designatedTimestamp && (
            <DotIcon size="12px" />
          )}

          <StyledTitle
            color="foreground"
            ellipsis
            kind={kind}
            data-hook={`schema-${kind}-title`}
          >
            {isTableKind && (
              <TableIcon
                partitionBy={partitionBy}
                walEnabled={walEnabled}
              />
            )}
            <Highlighter
              highlightClassName="highlight"
              searchWords={[query ?? ""]}
              textToHighlight={name}
            />
          </StyledTitle>

          {kind === "matview" && baseTable && (
            <>
              <Text weight={600} color="foreground">[Base:&nbsp;</Text>
              <TruncatedBox data-hook="base-table-name">
                <Text color="gray2" _style="normal">{baseTable}</Text>
              </TruncatedBox>
              <Text weight={600} color="foreground">]</Text>
            </>
          )}

          {type && (
            <Type _style="italic" color="gray2" transform="lowercase">
              ({type})
            </Type>
          )}

          {showLoader && <Loader size="18px" />}

          <Spacer />

          {errors && errors.length > 0 && (
            <TableActions>
              <PopperHover
                placement="top"
                trigger={
                  <ErrorIconWrapper data-hook="schema-row-error-icon">
                    <ErrorIcon size="18px" />
                  </ErrorIconWrapper>
                }
              >
                <Tooltip>
                  {errors.length > 1 ? errors.map((error) => (
                    <ErrorItem key={error}>
                      <ErrorIconWrapper>
                        <ErrorIcon size="18px" />
                      </ErrorIconWrapper>
                      <Text color="foreground">{error}</Text>
                    </ErrorItem>
                  )) : (
                    <Text color="foreground">{errors[0]}</Text>
                  )}
                </Tooltip>
              </PopperHover>
            </TableActions>
          )}
        </FlexRow>
      </Box>
    </Wrapper>
  )
}

export default Row
