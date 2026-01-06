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

import React, { useState, useEffect, useRef, useLayoutEffect } from "react"
import styled from "styled-components"
import { SortDown, Bracket, InfoCircle } from "@styled-icons/boxicons-regular"
import { ChevronRight } from "@styled-icons/boxicons-solid"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { CheckboxBlankCircle, Loader4 } from "@styled-icons/remix-line"
import type { StyledIcon } from "@styled-icons/styled-icon"
import {
  OneHundredTwentyThree,
  CalendarMinus,
  Globe,
  GeoAlt,
  Type as CharIcon,
  Tag,
} from "@styled-icons/bootstrap"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon } from "../table-icon"
import { Box, Text, IconWithTooltip, spinAnimation } from "../../../components"
import { color } from "../../../utils"
import { useSchema } from "../SchemaContext"
import { Checkbox } from "../checkbox"
import { PopperHover } from "../../../components/PopperHover"
import { Tooltip } from "../../../components/Tooltip"
import { mapColumnTypeToUI } from "../../../scenes/Import/ImportCSVFiles/utils"
import { MATVIEWS_GROUP_KEY, TABLES_GROUP_KEY } from "../localStorageUtils"
import { TreeNavigationOptions } from "../VirtualTables"

export type TreeNodeKind = "column" | "table" | "matview" | "folder" | "detail"

type Props = Readonly<{
  id: string
  index: number
  kind: TreeNodeKind
  name: string
  className?: string
  designatedTimestamp?: string
  expanded?: boolean
  onExpandCollapse: () => void | Promise<void>
  navigateInTree: (options: TreeNavigationOptions) => void
  "data-hook"?: string
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  isLoading?: boolean
  type?: string
  errors?: string[]
  value?: string | React.ReactNode
}>

const Type = styled(Text)`
  align-items: center;
  display: inline-block;
`

const Title = styled(Text)`
  .highlight {
    background-color: #7c804f;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Wrapper = styled.div<{
  $level?: number
  $selectOpen?: boolean
  $focused?: boolean
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  user-select: none;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  min-width: fit-content;
  width: 100%;
  flex-grow: 1;

  cursor: ${({ $selectOpen }) => ($selectOpen ? "pointer" : "default")};

  ${({ $level }) =>
    $level &&
    `
    padding-left: ${$level * 1.5 + 1}rem;
  `}

  ${({ $focused, theme }) =>
    $focused &&
    `
    outline: none;
    background: ${theme.color.tableSelection};
    border: 1px solid ${theme.color.cyan};
  `}
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

  svg {
    color: ${color("cyan")};
  }
`

const TableActions = styled.span`
  z-index: 1;
  position: relative;
  display: inline-flex;
  align-items: center;
`

const FlexRow = styled.div<{ $selectOpen?: boolean; $isTableKind?: boolean }>`
  display: flex;
  align-items: center;
  padding-right: 1rem;
  transform: translateX(
    ${({ $selectOpen, $isTableKind }) =>
      $selectOpen && $isTableKind ? "1rem" : "0"}
  );
  transition: transform 275ms ease-in-out;
`

const Spacer = styled.span`
  flex: 1;
`

const SortDownIcon = styled(SortDown)`
  color: ${color("green")};
  margin-right: 0.8rem;
  flex-shrink: 0;
`

const ChevronRightIcon = styled(ChevronRight)<{ $expanded?: boolean }>`
  color: ${color("gray2")};
  margin-right: 1.5rem;
  cursor: pointer;
  flex-shrink: 0;
  width: 1.5rem;
  transform: rotateZ(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
  position: absolute;
  left: -2rem;
`

const DotIcon = styled(CheckboxBlankCircle)`
  color: ${color("gray2")};
  margin-right: 1rem;
`

const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("orange")};
  ${spinAnimation};
`

const ErrorIconWrapper = styled.div`
  display: inline-flex;
  align-items: center;
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

const TypeIcon = styled.div<{ $type?: string }>`
  margin-right: 0.8rem;
  display: flex;
  align-items: center;
  color: ${color("cyan")};

  svg {
    color: ${({ $type }) =>
      $type === "SYMBOL" ? color("yellow") : color("cyan")};
  }
`

const TYPE_ICONS = {
  number: {
    types: [
      "BOOLEAN",
      "BYTE",
      "SHORT",
      "INT",
      "LONG",
      "LONG256",
      "DOUBLE",
      "FLOAT",
      "BINARY",
      "UUID",
    ],
    icon: OneHundredTwentyThree,
  },
  date: {
    types: ["DATE"],
    icon: CalendarMinus,
  },
  text: {
    types: ["CHAR", "VARCHAR", "STRING"],
    icon: CharIcon,
  },
  symbol: {
    types: ["SYMBOL"],
    icon: Tag,
  },
  time: {
    types: ["TIMESTAMP", "INTERVAL", "TIMESTAMP_NS"],
    icon: SortDown,
  },
  network: {
    types: ["IPV4"],
    icon: Globe,
  },
  geo: {
    types: ["GEOHASH"],
    icon: GeoAlt,
  },
  array: {
    types: ["ARRAY"],
    icon: Bracket,
  },
} as const

const IconWrapper = ({
  icon: Icon,
  size = "14px",
  type,
}: {
  icon: StyledIcon
  size?: string
  type?: string
}) => (
  <TypeIcon $type={type}>
    <Icon size={size} />
  </TypeIcon>
)

const getIcon = (type: string) => {
  const iconConfig = Object.values(TYPE_ICONS).find(({ types }) =>
    types.some((t) => t === mapColumnTypeToUI(type)),
  )

  return <IconWrapper icon={iconConfig?.icon ?? DotIcon} type={type} />
}

export const ColumnIcon = ({
  isDesignatedTimestamp,
  type,
}: {
  isDesignatedTimestamp: boolean
  type?: string
}) => {
  if (!type) return null

  if (isDesignatedTimestamp) {
    return (
      <IconWithTooltip
        icon={
          <SortDownIcon data-hook="designated-timestamp-icon" size="14px" />
        }
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
  name,
  partitionBy,
  walEnabled,
  onExpandCollapse,
  navigateInTree,
  "data-hook": dataHook,
  isLoading,
  type,
  errors,
  value,
  id,
  index,
}: Props) => {
  const {
    query,
    selectOpen,
    selectedTables,
    handleSelectToggle,
    focusedIndex,
    setFocusedIndex,
  } = useSchema()
  const [showLoader, setShowLoader] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isExpandable =
    ["folder", "table", "matview"].includes(kind) ||
    (kind === "column" && type === "SYMBOL")
  const isTableKind = ["table", "matview"].includes(kind)
  const isRootFolder = [MATVIEWS_GROUP_KEY, TABLES_GROUP_KEY].includes(id ?? "")
  const matchesSearch =
    ["column", "table", "matview"].includes(kind) &&
    query &&
    name.toLowerCase().includes(query.toLowerCase())

  const selected = !!selectedTables.find(
    (t: { name: string; type: TreeNodeKind }) =>
      t.name === name && t.type === kind,
  )

  const handleExpandCollapse = () => {
    if (!isExpandable) {
      return
    }

    void onExpandCollapse()
  }

  const handleClick = () => {
    if (isTableKind && selectOpen && handleSelectToggle) {
      handleSelectToggle({ name, type: kind })
    }

    if ((!selectOpen || isRootFolder) && focusedIndex !== index) {
      setFocusedIndex(index)
    }
  }

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

  useLayoutEffect(() => {
    if (focusedIndex === index) {
      wrapperRef.current?.focus()
    }
  }, [focusedIndex])

  if (selectOpen && !isTableKind && !isRootFolder) {
    return null
  }

  return (
    <Wrapper
      $level={id ? id.split(":").length - 2 : 0}
      $selectOpen={selectOpen}
      $focused={focusedIndex === index}
      ref={wrapperRef}
      data-hook={dataHook ?? "schema-row"}
      data-kind={kind}
      data-search-match={matchesSearch}
      data-expanded={expanded}
      data-index={index}
      data-id={id}
      className={className}
      // eslint-disable-next-line jsx-a11y/tabindex-no-positive
      tabIndex={100}
      onBlur={() => {
        if (focusedIndex === index) {
          setFocusedIndex(null)
        }
      }}
      onContextMenu={(e) => {
        if (!isTableKind) {
          e.preventDefault()
        }
      }}
      onDoubleClick={handleExpandCollapse}
      onClick={handleClick}
      onKeyDown={(e) => {
        e.preventDefault()

        if (
          isExpandable &&
          (e.key === "Enter" ||
            (e.key === "ArrowRight" && !expanded) ||
            (e.key === "ArrowLeft" && expanded))
        ) {
          handleExpandCollapse()
        }

        const shouldGoToParent =
          (!isExpandable || !expanded) && e.key === "ArrowLeft"
        const shouldGoToNextSibling =
          ((!isExpandable || expanded) && e.key === "ArrowRight") ||
          e.key === "ArrowDown" ||
          e.key === "Tab"

        if (shouldGoToParent) {
          navigateInTree({ to: "parent", id })
        }
        if (shouldGoToNextSibling) {
          navigateInTree({ to: "next", id })
        }
        if (e.key === "ArrowUp" || (e.shiftKey && e.key === "Tab")) {
          navigateInTree({ to: "previous", id })
        }
        if (e.key === "Home") {
          navigateInTree({ to: "start" })
        }
        if (e.key === "End") {
          navigateInTree({ to: "end" })
        }
        if (e.key === "PageUp") {
          navigateInTree({ to: "pageUp" })
        }
        if (e.key === "PageDown") {
          navigateInTree({ to: "pageDown" })
        }
      }}
    >
      <Box
        align="center"
        justifyContent="flex-start"
        gap="2rem"
        style={{ width: "100%", position: "relative", minWidth: "fit-content" }}
      >
        {isTableKind && (
          <div style={{ position: "absolute", left: "-2rem" }}>
            <Checkbox visible={selectOpen} checked={selected} />
          </div>
        )}
        <FlexRow $selectOpen={selectOpen} $isTableKind={isTableKind}>
          {isExpandable && (!selectOpen || !isTableKind) && (
            <ChevronRightIcon
              size="15px"
              $expanded={expanded}
              onClick={handleExpandCollapse}
            />
          )}

          {kind === "column" && (
            <ColumnIcon
              isDesignatedTimestamp={name === designatedTimestamp}
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
                designatedTimestamp={designatedTimestamp}
                partitionBy={partitionBy}
                walEnabled={walEnabled}
                isMaterializedView={kind === "matview"}
              />
            )}
            {kind === "detail" && <InfoCircle size="14px" />}
            {["column", "table", "matview"].includes(kind) ? (
              <Highlighter
                highlightClassName="highlight"
                searchWords={[query ?? ""]}
                textToHighlight={name}
              />
            ) : (
              name
            )}
          </StyledTitle>

          {type && (
            <Type color="gray2" transform="lowercase" ellipsis>
              ({type})
            </Type>
          )}

          {kind === "detail" && !isLoading && (
            <Text color="gray2">{value}</Text>
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
                  {errors.length > 1 ? (
                    errors.map((error) => (
                      <ErrorItem key={error}>
                        <ErrorIconWrapper>
                          <ErrorIcon size="18px" />
                        </ErrorIconWrapper>
                        <Text color="foreground">{error}</Text>
                      </ErrorItem>
                    ))
                  ) : (
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
