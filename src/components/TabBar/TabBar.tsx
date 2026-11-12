import { PlusIcon } from "@phosphor-icons/react"
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { IconButton } from "../IconButton"
import { Tab } from "./Tab"
import type { TabBarProps, TabProperties } from "./types"
import {
  computeTabWidths,
  cumulativePositions,
  displayedIndexDuringDrag,
} from "./tabLayout"
import { useTabDrag } from "./useTabDrag"
import { useSelectionGlass } from "./useSelectionGlass"
import { useJustAddedTabs } from "./useJustAddedTabs"
import { useOptimisticOrder } from "../../hooks/useOptimisticOrder"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

const JUST_DRAGGED_MS = 200
const REVEAL_FALLBACK_MS = 300

type Overflow = { left: boolean; right: boolean; rightOffset: number }

// The preview of a closed tab and the AI diff tab sit after the user's tabs:
// they cannot be dragged, no tab can be dropped past them, and they do not
// count as the last open tab.
const isTrailing = (tab: TabProperties) =>
  tab.className?.includes("temporary-tab") === true ||
  tab.className?.includes("preview-tab") === true

const scrollTabIntoView = (container: HTMLElement, tabEl: HTMLElement) => {
  const tabRect = tabEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const tabLeft = tabRect.left - containerRect.left + container.scrollLeft
  const tabRight = tabLeft + tabRect.width
  const visibleRight = container.scrollLeft + containerRect.width

  if (tabLeft < container.scrollLeft) {
    container.scrollTo({ left: tabLeft })
  } else if (tabRight > visibleRight) {
    container.scrollTo({ left: tabRight - containerRect.width })
  }
}

export const TabBar = ({
  tabs,
  className,
  darkMode,
  limit,
  onTabActive,
  onTabClose,
  onTabRename,
  onTabReorder,
  onNewTab,
  onContextMenu,
}: TabBarProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const lensMapRef = useRef<SVGFEImageElement>(null)
  const filterRef = useRef<SVGFilterElement>(null)

  const [rootWidth, setRootWidth] = useState(0)
  const [ready, setReady] = useState(false)
  const [overflow, setOverflow] = useState<Overflow>({
    left: false,
    right: false,
    rightOffset: 0,
  })
  const [justDraggedId, setJustDraggedId] = useState<string | null>(null)
  const [revealId, setRevealId] = useState<string | null>(null)
  const lastDragIdRef = useRef<string | null>(null)

  const { displayedItems: displayedTabs, applyMove } = useOptimisticOrder(
    tabs,
    (tab) => tab.id,
  )
  const justAddedIds = useJustAddedTabs(tabs, ready)
  const syncGlass = useSelectionGlass({
    rootRef,
    containerRef,
    layerRef,
    glassRef,
    lensMapRef,
    filterRef,
  })

  const widths = useMemo(
    () => computeTabWidths(rootWidth, displayedTabs.length),
    [rootWidth, displayedTabs.length],
  )
  const positions = useMemo(() => cumulativePositions(widths), [widths])
  const totalWidth = positions.length
    ? positions[positions.length - 1] + widths[widths.length - 1]
    : 0
  const pinnedCount = displayedTabs.filter((tab) => !isTrailing(tab)).length
  const lastReorderableIndex = pinnedCount - 1
  const activeId = tabs.find((tab) => tab.active)?.id
  const layoutKey = displayedTabs.map((tab) => tab.id).join(",")
  const showNewTabButton = !(limit !== undefined && tabs.length >= limit)

  const { drag, startDrag } = useTabDrag({
    containerRef,
    positions,
    widths,
    totalWidth,
    lastReorderableIndex,
    onReorder: (id, fromIndex, toIndex) => {
      applyMove(fromIndex, toIndex)
      setJustDraggedId(id)
      onTabReorder(id, fromIndex, toIndex)
    },
    onDragMove: () => syncGlass({ animate: false, refreshLens: false }),
  })
  const dragging = drag !== null

  const updateOverflow = () => {
    const root = rootRef.current
    const container = containerRef.current
    if (!root || !container) return
    const rootRect = root.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const next: Overflow = {
      left: container.scrollLeft > 0,
      right:
        container.scrollLeft + container.clientWidth <
        container.scrollWidth - 1,
      rightOffset: Math.max(0, rootRect.right - containerRect.right),
    }
    setOverflow((previous) =>
      previous.left === next.left &&
      previous.right === next.right &&
      previous.rightOffset === next.rightOffset
        ? previous
        : next,
    )
  }

  const scrollTabIdIntoView = (id: string) => {
    const container = containerRef.current
    const tabEl = rootRef.current?.querySelector<HTMLElement>(
      `.chrome-tab[data-tab-id="${id}"]`,
    )
    if (container && tabEl) scrollTabIntoView(container, tabEl)
  }

  const scrollActiveIntoView = () => {
    if (activeId !== undefined) scrollTabIdIntoView(activeId)
  }

  const tabStyle = (index: number): React.CSSProperties => {
    const width = widths[index]
    if (drag && drag.fromIndex === index) {
      return { width, transform: `translate3d(${drag.x}px, 0, 0)` }
    }
    const slot = drag
      ? displayedIndexDuringDrag(index, drag.fromIndex, drag.toIndex)
      : index
    return { width, transform: `translate3d(${positions[slot] ?? 0}px, 0, 0)` }
  }

  const tabClassName = (tab: TabProperties) =>
    [
      "chrome-tab",
      tab.className,
      drag?.id === tab.id && "chrome-tab-is-dragging",
      justAddedIds.has(tab.id) && "chrome-tab-was-just-added",
      justDraggedId === tab.id && "chrome-tab-was-just-dragged",
    ]
      .filter(Boolean)
      .join(" ")

  const rootClassName = [
    "chrome-tabs",
    darkMode && "chrome-tabs-dark-theme",
    ready && "chrome-tabs-ready",
    drag && "chrome-tabs-is-sorting",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    setRootWidth(root.clientWidth)
    const observer = new ResizeObserver(() => setRootWidth(root.clientWidth))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let frame: number | null = null
    const handleScroll = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        updateOverflow()
        syncGlass({ animate: false, refreshLens: false })
      })
    }
    container.addEventListener("scroll", handleScroll)
    return () => {
      container.removeEventListener("scroll", handleScroll)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  useLayoutEffect(() => {
    updateOverflow()
    syncGlass({ animate: false, refreshLens: true })
  }, [widths, layoutKey, showNewTabButton])

  useEffect(() => {
    if (rootWidth === 0 || ready) return
    const frame = window.requestAnimationFrame(() => {
      scrollActiveIntoView()
      setReady(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [rootWidth, ready])

  useEffect(() => {
    if (!ready) return
    syncGlass({ animate: true, refreshLens: true })
    const timer = window.setTimeout(scrollActiveIntoView)
    return () => window.clearTimeout(timer)
  }, [activeId, ready])

  useEffect(() => {
    if (drag) lastDragIdRef.current = drag.id
  }, [drag])

  useEffect(() => {
    if (dragging) return
    syncGlass({ animate: false, refreshLens: true })
    const droppedId = lastDragIdRef.current
    if (droppedId === null) return
    const timer = window.setTimeout(() => {
      scrollTabIdIntoView(droppedId)
      syncGlass({ animate: false, refreshLens: true })
    }, JUST_DRAGGED_MS)
    return () => window.clearTimeout(timer)
  }, [dragging])

  useEffect(() => {
    if (justDraggedId === null) return
    const timer = window.setTimeout(
      () => setJustDraggedId(null),
      JUST_DRAGGED_MS,
    )
    return () => window.clearTimeout(timer)
  }, [justDraggedId])

  useEffect(() => {
    const handleReveal = (id?: string) => setRevealId(id ?? null)
    eventBus.subscribe<string>(EventType.TAB_REVEAL, handleReveal)
    return () =>
      eventBus.unsubscribe<string>(EventType.TAB_REVEAL, handleReveal)
  }, [])

  useLayoutEffect(() => {
    if (revealId === null) return
    scrollTabIdIntoView(revealId)
    setRevealId(null)
  }, [layoutKey])

  useEffect(() => {
    if (revealId === null) return
    const timer = window.setTimeout(() => {
      scrollTabIdIntoView(revealId)
      setRevealId(null)
    }, REVEAL_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [revealId])

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      data-overflow-left={String(overflow.left)}
      data-overflow-right={String(overflow.right)}
    >
      <svg
        className="chrome-tabs-filter-defs"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            ref={filterRef}
            className="chrome-tabs-liquid-filter"
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              ref={lensMapRef}
              className="chrome-tabs-liquid-map"
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="liquid-map"
            />
            <feGaussianBlur
              in="liquid-map"
              stdDeviation="0.35"
              result="soft-liquid-map"
            />
            <feDisplacementMap
              className="chrome-tabs-liquid-displacement"
              in="SourceGraphic"
              in2="soft-liquid-map"
              scale="26"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        ref={layerRef}
        className="chrome-tabs-selection-layer"
        aria-hidden="true"
      >
        <div ref={glassRef} className="chrome-tabs-selection-glass" />
      </div>
      <div
        className="chrome-tabs-overflow-shadow chrome-tabs-overflow-shadow-left"
        aria-hidden="true"
      />
      <div
        className="chrome-tabs-overflow-shadow chrome-tabs-overflow-shadow-right"
        aria-hidden="true"
        style={{ right: overflow.rightOffset }}
      />
      <div
        ref={containerRef}
        className="chrome-tabs-content"
        role="tablist"
        aria-label="Editor tabs"
        style={{ width: totalWidth }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: Math.max(0, totalWidth - 1),
            width: 1,
            height: 1,
            visibility: "hidden",
            pointerEvents: "none",
          }}
        />
        {displayedTabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            style={tabStyle(index)}
            className={tabClassName(tab)}
            closable={isTrailing(tab) || pinnedCount > 1}
            onActivate={onTabActive}
            onClose={onTabClose}
            onRename={onTabRename}
            onContextMenu={(id, event) => onContextMenu?.(id, event)}
            onHandlePointerDown={(event) => {
              if (!isTrailing(tab)) startDrag(tab.id, index, event)
            }}
          />
        ))}
      </div>
      {showNewTabButton && (
        <div className="new-tab-button-wrapper">
          <IconButton
            className="new-tab-button"
            variant="ghost"
            label="Open new tab"
            data-hook="new-tab-button"
            onClick={onNewTab}
          >
            <PlusIcon size={20} weight="bold" />
          </IconButton>
        </div>
      )}
    </div>
  )
}
