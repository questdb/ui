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
import type { StyledIcon } from '@styled-icons/styled-icon'
import { OneHundredTwentyThree, CalendarMinus, Globe, GeoAlt, Type as CharIcon } from '@styled-icons/bootstrap'
import type { TreeNodeKind } from "../../../components/Tree"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon, MaterializedViewIcon } from "../table-icon"
import { Box } from "@questdb/react-components"
import { Text, TransitionDuration, IconWithTooltip, spinAnimation } from "../../../components"
import { color } from "../../../utils"
import { SchemaContext } from "../SchemaContext"
import { Checkbox } from "../checkbox"
import { PopperHover } from "../../../components/PopperHover"
import { Tooltip } from "../../../components/Tooltip"
import { mapColumnTypeToUI } from "../../../scenes/Import/ImportCSVFiles/utils"

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
  value?: string
}>

const Type = styled(Text)`
  display: flex;
  align-items: center;
  flex: 0;
  transition: opacity ${TransitionDuration.REG}ms;
`

const Title = styled(Text)`
  .highlight {
    background-color: #7c804f;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Wrapper = styled.div<{ $isExpandable: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  padding-left: 1rem;
  padding-right: 1rem;
  transition: background ${TransitionDuration.REG}ms;
  user-select: none;
  ${({ $isExpandable }) => $isExpandable && `
    cursor: pointer;
  `}

  &:hover,
  &:active {
    background: ${color("selection")};
  }
`

const StyledTitle = styled(Title)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  z-index: 1;
  flex-shrink: 0;
  margin-right: 1rem;

  .highlight {
    background-color: #45475a;
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

const TypeIcon = styled.div`
  margin-right: 0.8rem;
  display: flex;
  align-items: center;
  color: ${color("cyan")};
`

const TYPE_ICONS = {
  number: {
    types: ["BOOLEAN", "BYTE", "SHORT", "INT", "LONG", "LONG256", "DOUBLE", "FLOAT", "BINARY", "UUID"],
    icon: OneHundredTwentyThree
  },
  date: {
    types: ["DATE"],
    icon: CalendarMinus
  },
  text: {
    types: ["CHAR", "SYMBOL", "VARCHAR", "STRING"],
    icon: CharIcon
  },
  time: {
    types: ["TIMESTAMP", "INTERVAL"],
    icon: SortDown
  },
  network: {
    types: ["IPV4"],
    icon: Globe
  },
  geo: {
    types: ["GEOHASH"],
    icon: GeoAlt
  }
} as const

const IconWrapper = ({ icon: Icon, size = "14px" }: { icon: StyledIcon; size?: string }) => (
  <TypeIcon>
    <Icon size={size} />
  </TypeIcon>
)

const getIcon = (type: string) => {
  const iconConfig = Object.values(TYPE_ICONS).find(
    ({ types }) => types.some((t) => t === mapColumnTypeToUI(type))
  )
  
  return <IconWrapper icon={iconConfig?.icon ?? DotIcon} />
}

const ColumnIcon = ({ 
  indexed, 
  isDesignatedTimestamp, 
  type 
}: { 
  indexed?: boolean; 
  isDesignatedTimestamp: boolean;
  type?: string;
}) => {
  if (!type) return null

  if (indexed) {
    return (
      <IconWithTooltip
        icon={<RocketIcon size="13px" />}
        placement="top"
        tooltip="Indexed"
      />
    )
  }

  if (isDesignatedTimestamp) {
    return (
      <IconWithTooltip
        icon={<SortDownIcon size="14px" />}
        placement="top"
        tooltip="Designated timestamp"
      />
    )
  }

  return getIcon(type)
}

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
  value
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
      $isExpandable={isExpandable}
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

          {kind === "column" && (
            <ColumnIcon 
              indexed={indexed} 
              isDesignatedTimestamp={Boolean(!indexed && name === designatedTimestamp)}
              type={type}
            />
          )}

          <StyledTitle
            color="foreground"
            ellipsis
            data-hook={`schema-${kind}-title`}
          >
            {isTableKind && (
              <TableIcon
                isPartitioned={partitionBy && partitionBy !== "NONE"}
                walEnabled={walEnabled}
                isMaterializedView={kind === "matview"}
              />
            )}
            <Highlighter
              highlightClassName="highlight"
              searchWords={[query ?? ""]}
              textToHighlight={name}
            />
          </StyledTitle>

          {type && (
            <Type color="gray2" transform="lowercase">
              ({type})
            </Type>
          )}

          {kind === "detail" && (
            <Text color="gray2" transform="lowercase">
              {value}
            </Text>
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
