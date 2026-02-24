/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Original work Copyright (c) 2013 Adam Schwartz
 *  Derived work Copyright (c) 2024 QuestDB
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

import Draggabilly from "draggabilly"

const TAB_CONTENT_MIN_WIDTH = 150
const TAB_CONTENT_MAX_WIDTH = 240
const NEW_TAB_BUTTON_AREA = 90

const closest = (value: number, array: number[]) => {
  let closestDist = Infinity
  let closestIndex = -1

  array.forEach((v, i) => {
    if (Math.abs(value - v) < closestDist) {
      closestDist = Math.abs(value - v)
      closestIndex = i
    }
  })

  return closestIndex
}

const newTabButtonTemplate = `
    <div class="new-tab-button-wrapper">
      <button class="new-tab-button" data-hook="new-tab-button">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"></path></svg>
      </button>
    </div>
  `

const tabTemplate = `
      <div class="chrome-tab">
        <div class="chrome-tab-content">
          <div class="chrome-tab-favicon"></div>
          <div class="chrome-tab-title"></div>
          <input class="chrome-tab-rename" type="text" />
          <div class="chrome-tab-drag-handle"></div>
          <div class="chrome-tab-edit"></div>
          <div class="chrome-tab-close"></div>
        </div>
      </div>
    `

const defaultTapProperties = {
  title: "New tab",
  favicon: false,
}

export type TabProperties = {
  id: string
  title: string
  active?: boolean
  favicon?: boolean | string
  faviconClass?: string
  className?: string
}

// Event detail types for CustomEvent
export type TabEventDetail = {
  tabEl: HTMLElement
}

export type TabRenameEventDetail = {
  tabEl: HTMLElement
  title: string
}

export type TabReorderEventDetail = {
  tabEl: HTMLElement
  originIndex: number
  destinationIndex: number
}

export type TabContextMenuEventDetail = {
  tabEl: HTMLElement
  event: MouseEvent
}

let instanceId = 0

class ChromeTabs {
  el!: HTMLElement
  styleEl!: HTMLStyleElement
  limit?: number
  instanceId?: number
  draggabillies: Draggabilly[]
  isDragging: boolean
  draggabillyDragging: Draggabilly | null
  initialScrollDone: boolean
  autoScrollInterval: number | null
  autoScrollSpeed: number
  dragPlaceholder: HTMLElement | null
  dragState: {
    tabEl: HTMLElement | null
    originIndex: number
    currentIndex: number
    startScrollLeft: number
    pointerX: number
  }

  constructor() {
    this.draggabillies = []
    this.isDragging = false
    this.draggabillyDragging = null
    this.initialScrollDone = false
    this.autoScrollInterval = null
    this.autoScrollSpeed = 0
    this.dragPlaceholder = null
    this.dragState = {
      tabEl: null,
      originIndex: -1,
      currentIndex: -1,
      startScrollLeft: 0,
      pointerX: 0,
    }
  }

  init(el: HTMLElement, limit?: number) {
    this.el = el
    this.limit = limit

    this.instanceId = instanceId
    this.el.setAttribute("data-chrome-tabs-instance-id", this.instanceId + "")
    instanceId += 1

    this.setupStyleEl()
    this.setupEvents()
    this.layoutTabs()
    this.setupNewTabButton()
    this.setupDraggabilly()
  }

  emit(eventName: string, data: Record<string, unknown>) {
    this.el.dispatchEvent(new CustomEvent(eventName, { detail: data }))
  }

  setupStyleEl() {
    this.styleEl = document.createElement("style")
    this.el.appendChild(this.styleEl)
  }

  setupEvents() {
    window.addEventListener("resize", () => {
      this.cleanUpPreviouslyDraggedTabs()
      this.layoutTabs()
    })

    const resizeObserver = new ResizeObserver(() => {
      this.cleanUpPreviouslyDraggedTabs()
      this.layoutTabs()
    })

    resizeObserver.observe(this.el)

    this.tabContentEl.addEventListener("scroll", () => {
      this.updateOverflowShadows()
    })

    this.el.addEventListener("click", ({ target }) => {
      if (target instanceof Element) {
        const newTabButton = target.closest(".new-tab-button")
        if (newTabButton) {
          this.emit("newTab", {})
          this.setupNewTabButton()
        }
      }
    })

    this.tabEls.forEach((tabEl) => this.setTabCloseEventListener(tabEl))

    this.tabEls.forEach((tabEl) => this.setTabEditEventListener(tabEl))

    this.tabEls.forEach((tabEl) => this.setTabRenameConfirmEventListener(tabEl))

    document.addEventListener("click", ({ target }) => {
      if (
        target instanceof Element &&
        !target.classList.contains("chrome-tab-rename") &&
        !target.classList.contains("chrome-tab-content")
      ) {
        this.tabEls.forEach((tabEl) => {
          const inputEl =
            tabEl.querySelector<HTMLInputElement>(".chrome-tab-rename")
          if (!inputEl) return
          const val = inputEl.value
          if (
            tabEl.getAttribute("is-renaming") !== null &&
            val.trim() !== "" &&
            val.trim() !== tabEl.getAttribute("data-tab-title")
          ) {
            tabEl.setAttribute("data-tab-title", val)
            this.emit("tabRename", { tabEl, title: val })
          }
          this.hideRenameTab(tabEl)
        })
      }
    })
  }

  get tabEls(): HTMLElement[] {
    return Array.prototype.slice.call(
      this.el.querySelectorAll(".chrome-tab"),
    ) as HTMLElement[]
  }

  get tabContentEl() {
    return this.el.querySelector<HTMLElement>(".chrome-tabs-content")!
  }

  get tabWidths() {
    const numberOfTabs = this.tabEls.length
    const availableWidth = this.el.clientWidth - NEW_TAB_BUTTON_AREA
    const targetWidth = availableWidth / numberOfTabs
    const clampedTargetWidth = Math.max(
      TAB_CONTENT_MIN_WIDTH,
      Math.min(TAB_CONTENT_MAX_WIDTH, targetWidth),
    )
    const flooredClampedTargetWidth = Math.floor(clampedTargetWidth)
    const totalTabsWidthUsingTarget = flooredClampedTargetWidth * numberOfTabs
    const totalExtraWidthDueToFlooring =
      availableWidth - totalTabsWidthUsingTarget

    const widths = []
    let extraWidthRemaining = totalExtraWidthDueToFlooring
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraWidth =
        flooredClampedTargetWidth < TAB_CONTENT_MAX_WIDTH &&
        extraWidthRemaining > 0
          ? 1
          : 0
      widths.push(flooredClampedTargetWidth + extraWidth)
      if (extraWidthRemaining > 0) extraWidthRemaining -= 1
    }

    return widths
  }

  get tabPositions() {
    const positions: number[] = []
    const tabWidths = this.tabWidths

    let position = 0
    tabWidths.forEach((width) => {
      positions.push(position)
      position += width
    })

    return positions
  }

  layoutTabs() {
    const tabWidths = this.tabWidths

    this.tabEls.forEach((tabEl, i) => {
      tabEl.style.width = tabWidths[i] + "px"
      const closeEl = tabEl.querySelector<HTMLElement>(".chrome-tab-close")
      if (closeEl) {
        closeEl.style.display = this.tabEls.length > 1 ? "block" : "none"
      }
    })

    let styleHTML = ""
    this.tabPositions.forEach((position, i) => {
      styleHTML += `
          .chrome-tabs[data-chrome-tabs-instance-id="${
            this.instanceId
          }"] .chrome-tab:nth-child(${i + 1}) {
            transform: translate3d(${position}px, 0, 0)
          }
        `
    })
    this.styleEl.innerHTML = styleHTML

    const totalTabsWidth = tabWidths.reduce((sum, w) => sum + w, 0)
    this.tabContentEl.style.width = `${totalTabsWidth}px`

    this.updateOverflowShadows()
  }

  updateOverflowShadows() {
    const container = this.tabContentEl
    const scrollLeft = container.scrollLeft
    const scrollWidth = container.scrollWidth
    const clientWidth = container.clientWidth

    const hasOverflowLeft = scrollLeft > 0
    const hasOverflowRight = scrollLeft + clientWidth < scrollWidth - 1 // -1 for rounding tolerance

    const parentRect = this.el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const rightOffset = Math.max(0, parentRect.right - containerRect.right)
    this.el.style.setProperty(
      "--overflow-shadow-right-offset",
      `${rightOffset}px`,
    )

    this.el.setAttribute("data-overflow-left", hasOverflowLeft.toString())
    this.el.setAttribute("data-overflow-right", hasOverflowRight.toString())
  }

  createNewTabEl() {
    const div = document.createElement("div")
    div.innerHTML = tabTemplate
    return div.firstElementChild
  }

  addTab(
    tabProperties?: TabProperties,
    { animate = true, background = false } = {},
  ) {
    const tabEl = this.createNewTabEl() as HTMLElement
    tabEl.oncontextmenu = (event) => {
      this.emit("contextmenu", { tabEl, event })
    }
    if (animate && this.initialScrollDone) {
      tabEl.classList.add("chrome-tab-was-just-added")
      setTimeout(() => tabEl.classList.remove("chrome-tab-was-just-added"), 500)
    }

    tabProperties = Object.assign({}, defaultTapProperties, tabProperties)
    this.tabContentEl.appendChild(tabEl)
    this.setTabCloseEventListener(tabEl)
    this.setTabEditEventListener(tabEl)
    this.setTabRenameConfirmEventListener(tabEl)
    this.updateTab(tabEl, tabProperties)
    this.emit("tabAdd", { tabEl })
    if (!background) this.setCurrentTab(tabEl)
    this.cleanUpPreviouslyDraggedTabs()
    this.layoutTabs()
    this.setupDraggabilly()
    return tabEl
  }

  setTabCloseEventListener(tabEl: HTMLElement) {
    const closeTabEvent = (_: Event) => {
      _.stopImmediatePropagation()
      this.emit("tabClose", { tabEl })
      this.setupNewTabButton()
    }
    tabEl
      .querySelector(".chrome-tab-close")!
      .addEventListener("click", closeTabEvent)
  }

  setTabEditEventListener(tabEl: HTMLElement) {
    const editTabEvent = (_: Event) => {
      _.stopImmediatePropagation()
      this.showRenameTab(tabEl)
    }
    tabEl
      .querySelector(".chrome-tab-edit")!
      .addEventListener("click", editTabEvent)
  }

  setTabRenameConfirmEventListener(tabEl: HTMLElement) {
    const input = tabEl.querySelector(".chrome-tab-rename") as HTMLInputElement
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && input.value !== "") {
        tabEl.setAttribute("data-tab-title", input.value)
        this.emit("tabRename", { tabEl, title: input.value })
        this.toggleRenameTab(tabEl)
      } else if (e.key === "Escape") {
        this.toggleRenameTab(tabEl)
      }
    })
  }

  get activeTabEl() {
    return this.el.querySelector(".chrome-tab[active]")
  }

  hasActiveTab() {
    return !!this.activeTabEl
  }

  setCurrentTab(tabEl: HTMLElement) {
    const activeTabEl = this.activeTabEl
    if (activeTabEl === tabEl) return
    if (activeTabEl) activeTabEl.removeAttribute("active")
    tabEl.setAttribute("active", "")
    this.emit("activeTabChange", { tabEl })
    if (this.initialScrollDone) {
      setTimeout(() => this.scrollTabIntoView(tabEl))
    }
  }

  scrollTabIntoView(tabEl: HTMLElement) {
    const container = this.tabContentEl
    const tabIndex = this.tabEls.indexOf(tabEl)
    if (tabIndex === -1) return

    const tabRect = tabEl.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const tabLeft = tabRect.left - containerRect.left + container.scrollLeft
    const tabRight = tabLeft + tabRect.width

    const containerScrollLeft = container.scrollLeft
    const containerVisibleWidth = containerRect.width
    const containerVisibleRight = containerScrollLeft + containerVisibleWidth

    if (tabLeft < containerScrollLeft) {
      container.scrollTo({
        left: tabLeft,
      })
    } else if (tabRight > containerVisibleRight) {
      container.scrollTo({
        left: tabRight - containerVisibleWidth,
      })
    }
  }

  completeInitialSetup() {
    if (this.initialScrollDone) return

    this.initialScrollDone = true
    const activeTab = this.activeTabEl as HTMLElement | null
    if (activeTab) {
      this.scrollTabIntoView(activeTab)
    }
    this.el.classList.add("chrome-tabs-ready")
  }

  removeTab(tabEl: HTMLElement) {
    if (tabEl === this.activeTabEl) {
      if (tabEl.nextElementSibling) {
        this.setCurrentTab(tabEl.nextElementSibling as HTMLElement)
      } else if (tabEl.previousElementSibling) {
        this.setCurrentTab(tabEl.previousElementSibling as HTMLElement)
      }
    }
    tabEl.parentNode!.removeChild(tabEl)
    this.emit("tabRemove", { tabEl })
    this.cleanUpPreviouslyDraggedTabs()
    this.layoutTabs()
    this.setupDraggabilly()
  }

  updateTab(tabEl: HTMLElement, tabProperties: TabProperties) {
    tabEl.setAttribute("data-tab-title", tabProperties.title)
    tabEl.querySelector(".chrome-tab-title")!.textContent = tabProperties.title
    const input = tabEl.querySelector(".chrome-tab-rename")!
    input.setAttribute("value", tabProperties.title)
    input.setAttribute("placeholder", tabProperties.title)

    const faviconEl = tabEl.querySelector(".chrome-tab-favicon") as HTMLElement
    const { favicon, faviconClass, className } = tabProperties

    const currentClasses = tabEl.className.split(" ")
    const baseClasses = currentClasses.filter(
      (cls) =>
        cls.startsWith("chrome-tab") ||
        cls === "dragging" ||
        cls === "phantom-tab",
    )

    if (className) {
      tabEl.className = [...baseClasses, ...className.split(" ")].join(" ")
    } else {
      tabEl.className = baseClasses.join(" ")
    }
    faviconEl.className = "chrome-tab-favicon"
    faviconEl.style.backgroundImage = ""
    if (favicon || faviconClass) {
      if (faviconClass) {
        faviconEl.className = ["chrome-tab-favicon", faviconClass].join(" ")
      }
      if (favicon) {
        faviconEl.style.backgroundImage = `url('${favicon}')`
      }
      faviconEl?.removeAttribute("hidden")
    } else {
      faviconEl?.setAttribute("hidden", "")
      faviconEl?.removeAttribute("style")
    }

    if (tabProperties.id) {
      tabEl.setAttribute("data-tab-id", tabProperties.id)
    }
  }

  isTabRenameable(tabEl: HTMLElement) {
    return (
      !tabEl.classList.contains("temporary-tab") &&
      !tabEl.classList.contains("preview-tab")
    )
  }

  showRenameTab(tabEl: HTMLElement) {
    if (!this.isTabRenameable(tabEl)) {
      return
    }
    tabEl.setAttribute("is-renaming", "")
    tabEl.setAttribute("data-tab-title", tabEl.textContent?.trim() || "")
    const titleEl = tabEl.querySelector(".chrome-tab-title") as HTMLDivElement
    const inputEl = tabEl.querySelector(
      ".chrome-tab-rename",
    ) as HTMLInputElement
    const closeEl = tabEl.querySelector(".chrome-tab-close") as HTMLDivElement
    const editEl = tabEl.querySelector(".chrome-tab-edit") as HTMLDivElement
    titleEl.style.display = "none"
    inputEl.style.display = "block"
    closeEl.style.display = "none"
    editEl.style.display = "none"
    inputEl.focus()
    inputEl.select()
  }

  hideRenameTab(tabEl: HTMLElement) {
    tabEl.removeAttribute("is-renaming")
    const titleEl = tabEl.querySelector(".chrome-tab-title") as HTMLDivElement
    const inputEl = tabEl.querySelector(
      ".chrome-tab-rename",
    ) as HTMLInputElement
    if (tabEl.getAttribute("data-tab-title")) {
      inputEl.value = tabEl.getAttribute("data-tab-title") || ""
      titleEl.textContent = tabEl.getAttribute("data-tab-title") || ""
    }
    const closeEl = tabEl.querySelector(".chrome-tab-close") as HTMLDivElement
    const editEl = tabEl.querySelector(".chrome-tab-edit") as HTMLDivElement
    titleEl.style.display = "block"
    inputEl.style.display = "none"
    closeEl.style.display = this.tabEls.length > 1 ? "block" : "none"
    editEl.style.display = ""
  }

  toggleRenameTab(tabEl: HTMLElement) {
    const titleEl = tabEl.querySelector(".chrome-tab-title") as HTMLDivElement
    if (titleEl.style.display === "none") {
      this.hideRenameTab(tabEl)
    } else {
      this.showRenameTab(tabEl)
    }
  }

  cleanUpPreviouslyDraggedTabs() {
    this.tabEls.forEach((tabEl) =>
      tabEl.classList.remove("chrome-tab-was-just-dragged"),
    )
  }

  createDragPlaceholder(tabWidth: number) {
    if (this.dragPlaceholder) return

    this.dragPlaceholder = document.createElement("div")
    this.dragPlaceholder.style.width = `${tabWidth}px`
    this.dragPlaceholder.style.height = "1px"
    this.dragPlaceholder.style.visibility = "hidden"
    this.dragPlaceholder.style.pointerEvents = "none"
    this.dragPlaceholder.style.position = "absolute"
    // Position it at the end of the tab content to maintain scrollWidth
    const totalWidth =
      this.tabPositions[this.tabPositions.length - 1] + tabWidth
    this.dragPlaceholder.style.left = `${totalWidth - tabWidth}px`
    this.dragPlaceholder.classList.add("chrome-tab-drag-placeholder")

    this.tabContentEl.appendChild(this.dragPlaceholder)
  }

  removeDragPlaceholder() {
    if (this.dragPlaceholder) {
      this.dragPlaceholder.remove()
      this.dragPlaceholder = null
    }
  }

  startAutoScroll() {
    if (this.autoScrollInterval) return

    this.autoScrollInterval = window.setInterval(() => {
      if (this.autoScrollSpeed === 0 || !this.isDragging) return

      const container = this.tabContentEl
      const newScrollLeft = container.scrollLeft + this.autoScrollSpeed
      const maxScroll = container.scrollWidth - container.clientWidth

      container.scrollLeft = Math.max(0, Math.min(maxScroll, newScrollLeft))
      this.updateOverflowShadows()

      if (this.dragState.tabEl) {
        this.updateDraggedTabPosition()
      }
    }, 16) // ~60fps
  }

  stopAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval)
      this.autoScrollInterval = null
    }
    this.autoScrollSpeed = 0
  }

  updateDraggedTabPosition() {
    const { tabEl, pointerX } = this.dragState
    if (!tabEl) return

    const container = this.tabContentEl
    const containerRect = container.getBoundingClientRect()
    const tabWidth = tabEl.offsetWidth

    // Calculate absolute position in the scrollable content based on pointer position
    const relativePointerX = pointerX - containerRect.left
    const absoluteX = relativePointerX + container.scrollLeft - tabWidth / 2

    // Clamp to valid range
    const maxPosition = container.scrollWidth - tabWidth
    const clampedPosition = Math.max(0, Math.min(maxPosition, absoluteX))

    // For fixed positioning, we need screen coordinates
    // Visual X in container = clampedPosition - scrollLeft
    // Screen X = containerRect.left + visualX
    const visualX = clampedPosition - container.scrollLeft
    const screenX = containerRect.left + visualX

    // Update tab position using fixed positioning (left/top instead of transform)
    tabEl.style.left = `${screenX}px`
    tabEl.style.top = `${containerRect.top}px`
    tabEl.style.transform = "none"

    // Check for reorder
    const destIndex = closest(clampedPosition, this.tabPositions)

    if (destIndex !== this.dragState.currentIndex && destIndex !== -1) {
      this.animateTabMove(tabEl, this.dragState.currentIndex, destIndex)
      this.dragState.currentIndex = destIndex
    }
  }

  setupDraggabilly() {
    const tabEls = this.tabEls

    if (this.isDragging && this.draggabillyDragging) {
      this.isDragging = false
      this.el.classList.remove("chrome-tabs-is-sorting")
      this.removeDragPlaceholder()
      const draggabilly = this.draggabillyDragging as unknown as {
        element: HTMLElement
        dragEnd: () => void
        isDragging: boolean
        positionDrag: () => void
        destroy: () => void
      }
      draggabilly.element.classList.remove("chrome-tab-is-dragging")
      draggabilly.element.style.transform = ""
      draggabilly.dragEnd()
      draggabilly.isDragging = false
      draggabilly.positionDrag = () => {} // Prevent Draggabilly from updating tabEl.style.transform in later frames
      draggabilly.destroy()
      this.draggabillyDragging = null
    }

    this.draggabillies.forEach((d) => d.destroy())
    this.draggabillies = []

    if (tabEls.find((el) => el.classList.contains("temporary-tab"))) {
      return
    }

    tabEls.forEach((tabEl) => {
      const draggabilly = new Draggabilly(tabEl, {
        axis: "x",
        handle: ".chrome-tab-drag-handle",
        containment: false,
      })

      let lastClickX: number
      let lastClickY: number
      let lastTimeStamp: number = 0
      let wasActiveBefore: boolean

      this.draggabillies.push(draggabilly)

      draggabilly.on("pointerDown", (event, pointer) => {
        // @ts-expect-error - timeStamp exists on pointer but not in types
        const timeStamp = pointer.timeStamp as number
        if (event.target === tabEl.querySelector(".chrome-tab-drag-handle")) {
          if (
            lastClickX === pointer.clientX &&
            lastClickY === pointer.clientY &&
            timeStamp - lastTimeStamp < 500 &&
            wasActiveBefore
          ) {
            tabEls.forEach((el) => this.hideRenameTab(el))
            this.showRenameTab(tabEl)
            event.stopImmediatePropagation()
            wasActiveBefore = false
          }
          wasActiveBefore = tabEl.hasAttribute("active")
          lastClickX = pointer.clientX
          lastClickY = pointer.clientY
          lastTimeStamp = timeStamp
        }
        this.emit("tabClick", { tabEl })
      })

      draggabilly.on("dragStart", (_event, pointer) => {
        this.isDragging = true
        this.draggabillyDragging = draggabilly

        const originIndex = this.tabEls.indexOf(tabEl)
        const tabWidth = tabEl.offsetWidth

        this.createDragPlaceholder(tabWidth)

        tabEl.classList.add("chrome-tab-is-dragging")
        this.el.classList.add("chrome-tabs-is-sorting")

        this.dragState = {
          tabEl,
          originIndex,
          currentIndex: originIndex,
          startScrollLeft: this.tabContentEl.scrollLeft,
          pointerX: pointer.clientX,
        }

        // Disable Draggabilly's positioning - we'll handle it ourselves
        // @ts-expect-error - accessing internal property
        draggabilly.positionDrag = () => {}

        // Set initial position immediately
        this.updateDraggedTabPosition()

        this.emit("dragStart", {})
      })

      draggabilly.on("dragEnd", () => {
        this.isDragging = false
        this.stopAutoScroll()

        const { originIndex } = this.dragState

        this.dragState = {
          tabEl: null,
          originIndex: -1,
          currentIndex: -1,
          startScrollLeft: 0,
          pointerX: 0,
        }

        tabEl.style.position = ""
        tabEl.style.left = ""
        tabEl.style.top = ""

        const finalIndex = this.tabEls.indexOf(tabEl)
        const finalPosition = this.tabPositions[finalIndex]

        tabEl.style.transform = `translate3d(${finalPosition}px, 0, 0)`

        // Emit reorder BEFORE dragEnd so React component can process it first
        // Use finalIndex (actual DOM position) rather than currentIndex for accuracy
        if (originIndex !== finalIndex) {
          this.emit("tabReorder", {
            tabEl,
            originIndex,
            destinationIndex: finalIndex,
          })
        }

        this.emit("dragEnd", {})

        requestAnimationFrame(() => {
          tabEl.classList.remove("chrome-tab-is-dragging")
          this.el.classList.remove("chrome-tabs-is-sorting")
          tabEl.classList.add("chrome-tab-was-just-dragged")

          this.removeDragPlaceholder()

          requestAnimationFrame(() => {
            tabEl.style.transform = ""
            this.layoutTabs()
            this.setupDraggabilly()
            this.scrollTabIntoView(tabEl)
          })
        })
      })

      draggabilly.on("dragMove", (_event, pointer) => {
        const container = this.tabContentEl
        const containerRect = container.getBoundingClientRect()
        const tabWidth = tabEl.offsetWidth

        // Store pointer position for auto-scroll updates
        this.dragState.pointerX = pointer.clientX

        // Calculate absolute position in the scrollable content
        const relativePointerX = pointer.clientX - containerRect.left
        const absoluteX = relativePointerX + container.scrollLeft - tabWidth / 2

        const maxPosition = container.scrollWidth - tabWidth
        const clampedPosition = Math.max(0, Math.min(maxPosition, absoluteX))

        const visualX = clampedPosition - container.scrollLeft
        const screenX = containerRect.left + visualX

        tabEl.style.left = `${screenX}px`
        tabEl.style.top = `${containerRect.top}px`
        tabEl.style.transform = "none"

        const destIndex = closest(clampedPosition, this.tabPositions)

        if (destIndex !== this.dragState.currentIndex && destIndex !== -1) {
          this.animateTabMove(tabEl, this.dragState.currentIndex, destIndex)
          this.dragState.currentIndex = destIndex
        }

        const edgeThreshold = 50
        const maxScrollSpeed = 10

        const distanceFromLeft = pointer.clientX - containerRect.left
        const distanceFromRight = containerRect.right - pointer.clientX

        if (distanceFromLeft < edgeThreshold && container.scrollLeft > 0) {
          const intensity = 1 - distanceFromLeft / edgeThreshold
          this.autoScrollSpeed = -maxScrollSpeed * intensity
          this.startAutoScroll()
        } else if (
          distanceFromRight < edgeThreshold &&
          container.scrollLeft < container.scrollWidth - container.clientWidth
        ) {
          const intensity = 1 - distanceFromRight / edgeThreshold
          this.autoScrollSpeed = maxScrollSpeed * intensity
          this.startAutoScroll()
        } else {
          this.autoScrollSpeed = 0
        }
      })
    })
  }

  animateTabMove(
    tabEl: HTMLElement,
    originIndex: number,
    destinationIndex: number,
  ) {
    if (destinationIndex < originIndex) {
      tabEl.parentNode!.insertBefore(tabEl, this.tabEls[destinationIndex])
    } else {
      tabEl.parentNode!.insertBefore(tabEl, this.tabEls[destinationIndex + 1])
    }
    this.layoutTabs()
  }

  setupNewTabButton() {
    const newButtonEl = this.tabContentEl.parentNode?.querySelector(
      ".new-tab-button-wrapper",
    )
    const overLimit = this.limit && this.tabEls.length >= this.limit
    if (newButtonEl && overLimit) {
      newButtonEl.parentNode?.removeChild(newButtonEl)
      this.layoutTabs()
    } else if (!newButtonEl) {
      this.tabContentEl.insertAdjacentHTML("afterend", newTabButtonTemplate)
      this.layoutTabs()
    }
  }
}

export default ChromeTabs
