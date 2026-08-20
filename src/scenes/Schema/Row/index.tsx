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
import styled, { useTheme, keyframes, css } from "styled-components"
import { SortDown, Bracket, InfoCircle } from "../../../components/icons"
import { Error as ErrorIcon } from "../../../components/icons"
import { CheckboxBlankCircle, Loader4 } from "../../../components/icons"
import type { StyledIcon } from "../../../components/icons"
import {
  OneHundredTwentyThree,
  CalendarMinus,
  Globe,
  GeoAlt,
  Type as CharIcon,
  Tag,
} from "../../../components/icons"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon } from "../table-icon"
import {
  Box,
  Text,
  IconWithTooltip,
  spinAnimation,
  Button,
  IconButton,
  toast,
} from "../../../components"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { color, copyToClipboard } from "../../../utils"
import { useSchema } from "../SchemaContext"
import { Checkbox } from "../checkbox"
import { Tooltip } from "../../../components/Tooltip"
import { mapColumnTypeToUI } from "../../../scenes/Import/ImportCSVFiles/utils"
import {
  MATVIEWS_GROUP_KEY,
  TABLES_GROUP_KEY,
  VIEWS_GROUP_KEY,
} from "../localStorageUtils"
import { TreeNavigationOptions } from "../VirtualTables"
import { CaretRightIcon, InfoIcon } from "@phosphor-icons/react"

export type TreeNodeKind =
  | "column"
  | "table"
  | "matview"
  | "view"
  | "folder"
  | "detail"

type Props = Readonly<{
  id: string
  index: number
  kind: TreeNodeKind
  name: string
  className?: string
  designatedTimestamp?: string
  expanded?: boolean
  onExpandCollapse: () => void | Promise<void>
  onOpenDetailsDrawer?: () => void
  navigateInTree: (options: TreeNavigationOptions) => void
  "data-hook"?: string
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  isLoading?: boolean
  type?: string
  errors?: string[]
  value?: string | React.ReactNode
}>

const copyPulse = (pink: string) => keyframes`
  0% {
    box-shadow: ${pink} 0 0 0 1px;
  }
  75% {
    box-shadow: transparent 0 0 0 16px;
  }
`

const Type = styled(Text)`
  align-items: center;
  display: inline-block;
`

const Title = styled(Text)`
  .highlight {
    background-color: ${({ theme }) => theme.color.contentAccentStrong};
    color: ${({ theme }) => theme.color.contentInverse};
  }
`

const Wrapper = styled.div<{
  $viewDetailsButton?: boolean
  $level?: number
  $selectOpen?: boolean
  $focused?: boolean
  $isPulsing?: boolean
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0.65rem 0;
  user-select: none;
  border-radius: 0;
  min-width: fit-content;
  width: 100%;
  flex-grow: 1;

  cursor: ${({ $selectOpen }) => ($selectOpen ? "pointer" : "default")};

  ${({ $level }) =>
    $level &&
    `
    padding-left: ${$level * 2 + 1}rem;
  `}

  &:hover {
    background: ${({ theme }) => theme.color.interactionAccentHover};
    .table-menu-button {
      opacity: 1;
    }
  }

  ${({ $focused, theme }) =>
    $focused &&
    `
    outline: none;
    background: ${theme.color.interactionAccentActive};
    box-shadow: inset 0 0 0 1px ${theme.color.borderAccent};
    .table-menu-button {
      opacity: 1;
    }

    &:hover {
      background: ${theme.color.interactionAccentActive};
    }
  `}

  ${({ $viewDetailsButton }) =>
    $viewDetailsButton &&
    `
    padding-right: 3rem;
  `}

  ${({ $isPulsing, theme }) =>
    $isPulsing &&
    css`
      animation: ${copyPulse(theme.color.contentAccent)} 1000ms 0.1s;
    `}
`

const DetailsDrawerButton = styled(Button).attrs({ variant: "ghost" })`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  padding: 0.5rem;

  &&:active:not(:disabled):not([aria-disabled="true"]) {
    filter: none;
  }
`

const StyledTitle = styled(Title)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  z-index: 1;
  flex-shrink: 0;
  margin-right: 1rem;
  font-weight: 500;

  .highlight {
    background-color: ${({ theme }) => theme.color.contentAccentStrong};
    color: ${({ theme }) => theme.color.contentInverse};
  }

  svg {
    color: ${color("contentAccent")};
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
  color: ${color("contentAccent")};
  margin-right: 0.8rem;
  flex-shrink: 0;
`

const ExpandButton = styled(IconButton)<{ $expanded?: boolean }>`
  transform: rotateZ(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
  position: absolute;
  left: -2.9rem;

  && {
    width: 2.4rem;
    min-width: 2.4rem;
    height: 2.4rem;
    padding: 0;
  }

  &&:active:not(:disabled):not([aria-disabled="true"]) {
    filter: none;
  }
`

const DotIcon = styled(CheckboxBlankCircle)`
  color: ${color("contentSecondary")};
  margin-right: 1rem;
`

const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("statusWarning")};
  ${spinAnimation};
`

const ErrorIconWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  align-self: center;

  svg {
    color: ${({ theme }) => theme.color.statusDanger};
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
  color: ${color("contentAccent")};
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
}: {
  icon: StyledIcon
  size?: string
}) => (
  <TypeIcon>
    <Icon size={size} />
  </TypeIcon>
)

const getIcon = (type: string) => {
  const iconConfig = Object.values(TYPE_ICONS).find(({ types }) =>
    types.some((t) => t === mapColumnTypeToUI(type)),
  )

  return <IconWrapper icon={iconConfig?.icon ?? DotIcon} />
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
  onOpenDetailsDrawer,
  navigateInTree,
  "data-hook": dataHook,
  isLoading,
  type,
  errors,
  value,
  id,
  index,
}: Props) => {
  const theme = useTheme()
  const {
    query,
    selectOpen,
    selectedTables,
    handleSelectToggle,
    focusedIndex,
    setFocusedIndex,
  } = useSchema()
  const [showLoader, setShowLoader] = useState(false)
  const [isPulsing, setIsPulsing] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isExpandable =
    ["folder", "table", "matview", "view"].includes(kind) ||
    (kind === "column" && type === "SYMBOL")
  const isTableKind = ["table", "matview", "view"].includes(kind)
  const isRootFolder = [
    MATVIEWS_GROUP_KEY,
    TABLES_GROUP_KEY,
    VIEWS_GROUP_KEY,
  ].includes(id ?? "")
  const matchesSearch =
    ["column", "table", "matview", "view"].includes(kind) &&
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
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current)
        pulseTimeoutRef.current = null
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
      $viewDetailsButton={!!onOpenDetailsDrawer}
      $level={id ? id.split(":").length - 2 : 0}
      $selectOpen={selectOpen}
      $focused={focusedIndex === index}
      $isPulsing={isPulsing}
      ref={wrapperRef}
      data-hook={dataHook ?? "schema-row"}
      data-kind={kind}
      data-search-match={matchesSearch}
      data-expanded={expanded}
      data-index={index}
      data-id={id}
      data-focused={focusedIndex === index}
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
          (e.metaKey || e.ctrlKey) &&
          (e.key === "c" || e.key === "C") &&
          (isTableKind || kind === "column")
        ) {
          void trackEvent(ConsoleEvent.SCHEMA_NAME_COPY, {
            kind,
          })
          void copyToClipboard(name)
          toast.success("Copied to clipboard", { autoClose: 2000 })

          if (pulseTimeoutRef.current) {
            clearTimeout(pulseTimeoutRef.current)
          }
          setIsPulsing(true)
          pulseTimeoutRef.current = setTimeout(() => {
            setIsPulsing(false)
          }, 1000)
        }

        if (
          isExpandable &&
          (e.key === " " ||
            (e.key === "ArrowRight" && !expanded) ||
            (e.key === "ArrowLeft" && expanded))
        ) {
          handleExpandCollapse()
        }

        if (e.key === "Enter") {
          onOpenDetailsDrawer?.()
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
            <ExpandButton
              label={expanded ? `Collapse ${name}` : `Expand ${name}`}
              size="sm"
              $expanded={expanded}
              aria-expanded={expanded}
              onClick={handleExpandCollapse}
            >
              <CaretRightIcon size={15} />
            </ExpandButton>
          )}

          {kind === "column" && (
            <ColumnIcon
              isDesignatedTimestamp={name === designatedTimestamp}
              type={type}
            />
          )}

          <StyledTitle
            color="contentPrimary"
            ellipsis
            data-hook={`schema-${kind}-title`}
          >
            {isTableKind && (
              <TableIcon
                designatedTimestamp={designatedTimestamp}
                partitionBy={partitionBy}
                walEnabled={walEnabled}
                kind={kind as "table" | "matview" | "view"}
              />
            )}
            {kind === "detail" && <InfoCircle size="14px" />}
            {["column", "table", "matview", "view"].includes(kind) ? (
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
            <Type color="contentSecondary" transform="lowercase" ellipsis>
              ({type})
            </Type>
          )}

          {kind === "detail" && !isLoading && (
            <Text color="contentSecondary">{value}</Text>
          )}

          {showLoader && <Loader size="18px" />}

          <Spacer />

          {errors && errors.length > 0 && (
            <TableActions>
              <Tooltip
                placement="top"
                content={
                  errors.length > 1 ? (
                    errors.map((error) => (
                      <ErrorItem key={error}>
                        <ErrorIconWrapper>
                          <ErrorIcon size="18px" />
                        </ErrorIconWrapper>
                        <Text color="contentPrimary">{error}</Text>
                      </ErrorItem>
                    ))
                  ) : (
                    <Text color="contentPrimary">{errors[0]}</Text>
                  )
                }
              >
                <ErrorIconWrapper data-hook="schema-row-error-icon">
                  <ErrorIcon size="18px" />
                </ErrorIconWrapper>
              </Tooltip>
            </TableActions>
          )}
        </FlexRow>
      </Box>
      {!selectOpen && onOpenDetailsDrawer && (
        <DetailsDrawerButton
          aria-label="Open table details"
          size="sm"
          className="table-menu-button"
          data-hook="table-menu-button"
          onClick={onOpenDetailsDrawer}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <InfoIcon size={18} color={theme.color.contentAccent} />
        </DetailsDrawerButton>
      )}
    </Wrapper>
  )
}

export default Row
