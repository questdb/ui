import React, {
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react"
import { Virtuoso, VirtuosoHandle, ListRange } from "react-virtuoso"
import styled from "styled-components"

export type VirtualizedTreeItem = {
  id: string
  [key: string]: unknown
}

export type NavigationOptions =
  | { to: "start" }
  | { to: "end" }
  | { to: "next"; id: string }
  | { to: "previous"; id: string }
  | { to: "parent"; id: string }
  | { to: "pageUp" }
  | { to: "pageDown" }

export type VirtualizedTreeHandle = {
  navigateInTree: (options: NavigationOptions) => void
  scrollToIndex: (index: number) => void
}

type VirtualizedTreeProps<T extends VirtualizedTreeItem> = {
  items: T[]
  renderItem: (item: T, index: number, isFocused: boolean) => React.ReactNode
  onItemClick?: (item: T, index: number) => void
  onBlur?: () => void
  onItemDoubleClick?: (item: T, index: number) => void
  onItemKeyDown?: (item: T, index: number, event: React.KeyboardEvent) => void
  focusedIndex: number | null
  setFocusedIndex: (index: number | null) => void
  className?: string
  style?: React.CSSProperties
}

const Wrapper = styled.div`
  height: 100%;
  width: 100%;

  &:focus {
    outline: none;
  }
`

function VirtualizedTreeComponent<T extends VirtualizedTreeItem>(
  props: VirtualizedTreeProps<T>,
  ref: React.Ref<VirtualizedTreeHandle>,
) {
  const {
    items,
    renderItem,
    onItemClick,
    onItemDoubleClick,
    onItemKeyDown,
    onBlur,
    focusedIndex,
    setFocusedIndex,
    className,
    style,
  } = props

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const rangeRef = useRef<ListRange | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const findItemIndex = useCallback(
    (id: string) => {
      return items.findIndex((item) => item.id === id)
    },
    [items],
  )

  const navigateInTree = useCallback(
    (options: NavigationOptions) => {
      if (!virtuosoRef.current) {
        return
      }
      const { to } = options

      switch (to) {
        case "start":
          virtuosoRef.current.scrollIntoView({
            index: 0,
            align: "start",
            done: () => setFocusedIndex(0),
          })
          break
        case "end":
          virtuosoRef.current.scrollIntoView({
            index: items.length - 1,
            align: "end",
            done: () => setFocusedIndex(items.length - 1),
          })
          break
        case "next": {
          const { id: elementId } = options
          const nextIndex = Math.min(
            items.length - 1,
            findItemIndex(elementId) + 1,
          )
          virtuosoRef.current.scrollIntoView({
            index: nextIndex,
            done: () => setFocusedIndex(nextIndex),
          })
          break
        }
        case "previous": {
          const { id } = options
          const prevIndex = Math.max(0, findItemIndex(id) - 1)
          virtuosoRef.current.scrollIntoView({
            index: prevIndex,
            done: () => setFocusedIndex(prevIndex),
          })
          break
        }
        case "parent": {
          const { id: childId } = options
          const parentIndex = Math.max(0, findItemIndex(childId) - 1)
          virtuosoRef.current.scrollIntoView({
            index: parentIndex,
            done: () => setFocusedIndex(parentIndex),
          })
          break
        }
        case "pageUp": {
          if (!rangeRef.current) return
          const { startIndex: upStart, endIndex: upEnd } = rangeRef.current
          const upRangeLength = upEnd - upStart
          const upIndex =
            focusedIndex !== null && focusedIndex !== upStart
              ? upStart
              : Math.max(0, upStart - upRangeLength)
          virtuosoRef.current.scrollIntoView({
            index: upIndex,
            align: "start",
            done: () => setFocusedIndex(upIndex),
          })
          break
        }
        case "pageDown": {
          if (!rangeRef.current) return
          const { startIndex: downStart, endIndex: downEnd } = rangeRef.current
          const downRangeLength = downEnd - downStart
          const downIndex =
            focusedIndex !== null && focusedIndex !== downEnd
              ? downEnd
              : Math.min(items.length - 1, downEnd + downRangeLength)
          virtuosoRef.current.scrollIntoView({
            index: downIndex,
            align: "end",
            done: () => setFocusedIndex(downIndex),
          })
          break
        }
        default:
          break
      }
    },
    [items, focusedIndex, setFocusedIndex, findItemIndex],
  )

  const scrollToIndex = useCallback(
    (index: number) => {
      if (virtuosoRef.current) {
        virtuosoRef.current.scrollIntoView({
          index,
          done: () => setFocusedIndex(index),
        })
      }
    },
    [setFocusedIndex],
  )

  useImperativeHandle(
    ref,
    () => ({
      navigateInTree,
      scrollToIndex,
    }),
    [navigateInTree, scrollToIndex],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (focusedIndex === null && items.length > 0) {
        if (
          [
            "ArrowDown",
            "ArrowUp",
            "Tab",
            "Enter",
            "Home",
            "End",
            "PageUp",
            "PageDown",
          ].includes(e.key)
        ) {
          e.preventDefault()
          setFocusedIndex(0)
          return
        }
        return
      }

      if (focusedIndex === null) return

      const item = items[focusedIndex]
      if (!item) return

      if (onItemKeyDown) {
        onItemKeyDown(item, focusedIndex, e)
        if (e.defaultPrevented) return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          navigateInTree({ to: "next", id: item.id })
          break
        case "Tab":
          if (e.shiftKey) {
            e.preventDefault()
            navigateInTree({ to: "previous", id: item.id })
          } else {
            e.preventDefault()
            navigateInTree({ to: "next", id: item.id })
          }
          break
        case "ArrowUp":
          e.preventDefault()
          navigateInTree({ to: "previous", id: item.id })
          break
        case "Home":
          e.preventDefault()
          navigateInTree({ to: "start" })
          break
        case "End":
          e.preventDefault()
          navigateInTree({ to: "end" })
          break
        case "PageUp":
          e.preventDefault()
          navigateInTree({ to: "pageUp" })
          break
        case "PageDown":
          e.preventDefault()
          navigateInTree({ to: "pageDown" })
          break
      }
    },
    [focusedIndex, items, onItemKeyDown, navigateInTree],
  )

  return (
    <Wrapper
      ref={wrapperRef}
      className={className}
      style={style}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        onBlur?.()
        if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
          setFocusedIndex(null)
        }
      }}
    >
      <Virtuoso
        totalCount={items.length}
        ref={virtuosoRef}
        rangeChanged={(newRange) => {
          rangeRef.current = newRange
        }}
        data={items}
        itemContent={(index) => {
          const item = items[index]
          const isFocused = focusedIndex === index

          return (
            <div
              role="presentation"
              onClick={(e) => {
                e.stopPropagation()
                setFocusedIndex(index)
                onItemClick?.(item, index)
              }}
              onDoubleClick={() => onItemDoubleClick?.(item, index)}
              data-index={index}
              data-id={item.id}
            >
              {renderItem(item, index, isFocused)}
            </div>
          )
        }}
        style={{ height: "100%" }}
      />
    </Wrapper>
  )
}

export const VirtualizedTree = forwardRef(VirtualizedTreeComponent) as <
  T extends VirtualizedTreeItem,
>(
  props: VirtualizedTreeProps<T> & { ref?: React.Ref<VirtualizedTreeHandle> },
) => React.ReactElement
