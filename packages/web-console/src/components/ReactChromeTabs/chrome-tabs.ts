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

const TAB_CONTENT_MARGIN = 10
const TAB_CONTENT_OVERLAP_DISTANCE = 1

const TAB_OVERLAP_DISTANCE =
  TAB_CONTENT_MARGIN * 2 + TAB_CONTENT_OVERLAP_DISTANCE

const TAB_CONTENT_MIN_WIDTH = 24
const TAB_CONTENT_MAX_WIDTH = 240

const TAB_SIZE_SMALL = 84
const TAB_SIZE_SMALLER = 60
const TAB_SIZE_MINI = 48
const NEW_TAB_BUTTON_AREA = 90

const noop = (_: any) => {}

const newTabButtonTemplate = `
    <div class="new-tab-button-wrapper">
      <button class="new-tab-button">✚</button>
    </div>
  `

const closest = (value: number, array: number[]) => {
  let closest = Infinity
  let closestIndex = -1

  array.forEach((v, i) => {
    if (Math.abs(value - v) < closest) {
      closest = Math.abs(value - v)
      closestIndex = i
    }
  })

  return closestIndex
}

const tabTemplate = `
      <div class="chrome-tab">
        <div class="chrome-tab-dividers"></div>
        <div class="chrome-tab-background">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg"><defs><symbol id="chrome-tab-geometry-left" viewBox="0 0 214 36"><path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z"/></symbol><symbol id="chrome-tab-geometry-right" viewBox="0 0 214 36"><use xlink:href="#chrome-tab-geometry-left"/></symbol><clipPath id="crop"><rect class="mask" width="100%" height="100%" x="0"/></clipPath></defs><svg width="52%" height="100%"><use xlink:href="#chrome-tab-geometry-left" width="214" height="36" class="chrome-tab-geometry"/></svg><g transform="scale(-1, 1)"><svg width="52%" height="100%" x="-100%" y="0"><use xlink:href="#chrome-tab-geometry-right" width="214" height="36" class="chrome-tab-geometry"/></svg></g></svg>
        </div>
        <div class="chrome-tab-content">
          <div class="chrome-tab-favicon"></div>
          <div class="chrome-tab-title"></div>
          <input class="chrome-tab-rename" type="text" />
          <div class="chrome-tab-drag-handle"></div>
          <div class="chrome-tab-close"></div>
        </div>
      </div>
    `

const defaultTapProperties = {
  title: "New tab",
  favicon: false,
}

export interface TabProperties {
  id: string
  title: string
  active?: boolean
  favicon?: boolean | string
  faviconClass?: string
}

let instanceId = 0

class ChromeTabs {
  el!: HTMLElement
  styleEl!: HTMLStyleElement
  limit?: number
  instanceId?: number
  draggabillies: Draggabilly[]
  isDragging: any
  draggabillyDragging: any

  constructor() {
    this.draggabillies = []
  }

  init(el: HTMLElement, limit?: number) {
    this.el = el
    this.limit = limit

    this.instanceId = instanceId
    this.el.setAttribute("data-chrome-tabs-instance-id", this.instanceId + "")
    instanceId += 1

    this.setupCustomProperties()
    this.setupStyleEl()
    this.setupEvents()
    this.layoutTabs()
    this.setupNewTabButton()
    this.setupDraggabilly()
  }

  emit(eventName: string, data: any) {
    this.el.dispatchEvent(new CustomEvent(eventName, { detail: data }))
  }

  setupCustomProperties() {
    this.el.style.setProperty("--tab-content-margin", `${TAB_CONTENT_MARGIN}px`)
  }

  setupStyleEl() {
    this.styleEl = document.createElement("style")
    this.el.appendChild(this.styleEl)
  }

  setupEvents() {
    window.addEventListener("resize", (_) => {
      this.cleanUpPreviouslyDraggedTabs()
      this.layoutTabs()
    })

    this.el.addEventListener("click", ({ target }) => {
      if (target instanceof Element) {
        if (target.classList.contains("new-tab-button")) {
          this.emit("newTab", {})
          this.setupNewTabButton()
        }
      }
    })

    this.tabEls.forEach((tabEl) => this.setTabCloseEventListener(tabEl))

    this.tabEls.forEach((tabEl) => this.setTabRenameConfirmEventListener(tabEl))

    document.addEventListener("click", ({ target }) => {
      if (
        target instanceof Element &&
        !target.classList.contains("chrome-tab-rename") &&
        !target.classList.contains("chrome-tab-drag-handle") &&
        !target.classList.contains("chrome-tab-content")
      ) {
        this.tabEls.forEach((tabEl) => this.hideRenameTab(tabEl))
      }
    })
  }

  get tabEls() {
    return Array.prototype.slice.call(this.el.querySelectorAll(".chrome-tab"))
  }

  get tabContentEl() {
    return this.el.querySelector<HTMLElement>(".chrome-tabs-content")!
  }

  get tabContentWidths() {
    const numberOfTabs = this.tabEls.length
    const tabsContentWidth = this.el.clientWidth - NEW_TAB_BUTTON_AREA
    const tabsCumulativeOverlappedWidth =
      (numberOfTabs - 1) * TAB_CONTENT_OVERLAP_DISTANCE
    const targetWidth =
      (tabsContentWidth -
        2 * TAB_CONTENT_MARGIN +
        tabsCumulativeOverlappedWidth) /
      numberOfTabs
    const clampedTargetWidth = Math.max(
      TAB_CONTENT_MIN_WIDTH,
      Math.min(TAB_CONTENT_MAX_WIDTH, targetWidth),
    )
    const flooredClampedTargetWidth = Math.floor(clampedTargetWidth)
    const totalTabsWidthUsingTarget =
      flooredClampedTargetWidth * numberOfTabs +
      2 * TAB_CONTENT_MARGIN -
      tabsCumulativeOverlappedWidth
    const totalExtraWidthDueToFlooring =
      tabsContentWidth - totalTabsWidthUsingTarget

    // TODO - Support tabs with different widths / e.g. "pinned" tabs
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

  get tabContentPositions() {
    const positions: number[] = []
    const tabContentWidths = this.tabContentWidths

    let position = TAB_CONTENT_MARGIN
    tabContentWidths.forEach((width, i) => {
      const offset = i * TAB_CONTENT_OVERLAP_DISTANCE
      positions.push(position - offset)
      position += width
    })

    return positions
  }

  get tabPositions() {
    const positions: number[] = []

    this.tabContentPositions.forEach((contentPosition) => {
      positions.push(contentPosition - TAB_CONTENT_MARGIN)
    })

    return positions
  }

  layoutTabs() {
    const tabContentWidths = this.tabContentWidths

    this.tabEls.forEach((tabEl, i) => {
      const contentWidth = tabContentWidths[i]
      const width = contentWidth + 2 * TAB_CONTENT_MARGIN

      tabEl.style.width = width + "px"
      tabEl.removeAttribute("is-small")
      tabEl.removeAttribute("is-smaller")
      tabEl.removeAttribute("is-mini")

      if (contentWidth < TAB_SIZE_SMALL) tabEl.setAttribute("is-small", "")
      if (contentWidth < TAB_SIZE_SMALLER) tabEl.setAttribute("is-smaller", "")
      if (contentWidth < TAB_SIZE_MINI) tabEl.setAttribute("is-mini", "")

      tabEl.querySelector(".chrome-tab-close")!.style.display =
        this.tabEls.length > 1 ? "block" : "none"
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

    const tabsLen = this.tabEls.length
    if (
      this.el.offsetWidth - this.tabContentEl.offsetWidth >
        NEW_TAB_BUTTON_AREA + TAB_CONTENT_MARGIN / 2 ||
      tabsLen < 5
    ) {
      this.tabContentEl.style.width = `${
        (this.tabEls[0] ? this.tabEls[0].offsetWidth * tabsLen : 0) -
        (tabsLen > 0
          ? tabsLen * TAB_CONTENT_MARGIN * 2 -
            TAB_CONTENT_MIN_WIDTH +
            TAB_CONTENT_MARGIN
          : 0)
      }px`
      this.tabContentEl.nextElementSibling!.classList.remove("overflow-shadow")
    } else
      this.tabContentEl.nextElementSibling!.classList.add("overflow-shadow")
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
    if (animate) {
      tabEl.classList.add("chrome-tab-was-just-added")
      setTimeout(() => tabEl.classList.remove("chrome-tab-was-just-added"), 500)
    }

    tabProperties = Object.assign({}, defaultTapProperties, tabProperties)
    this.tabContentEl.appendChild(tabEl)
    this.setTabCloseEventListener(tabEl)
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
    tabEl.addEventListener("auxclick", closeTabEvent)
  }

  setTabRenameConfirmEventListener(tabEl: HTMLElement) {
    const input = tabEl.querySelector(".chrome-tab-rename") as HTMLInputElement
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && input.value !== "") {
        tabEl.setAttribute("data-original-value", input.value)
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
    tabEl.setAttribute("title", tabProperties.title)
    tabEl.querySelector(".chrome-tab-title")!.textContent = tabProperties.title
    const input = tabEl.querySelector(".chrome-tab-rename")!
    input.setAttribute("value", tabProperties.title)
    input.setAttribute("placeholder", tabProperties.title)

    const faviconEl = tabEl.querySelector(".chrome-tab-favicon") as HTMLElement
    const { favicon, faviconClass } = tabProperties
    faviconEl.className = "chrome-tab-favicon"
    faviconEl!.style!.backgroundImage = ""
    if (favicon || faviconClass) {
      if (faviconClass) {
        faviconEl.className = ["chrome-tab-favicon", faviconClass].join(" ")
      }
      if (favicon) {
        faviconEl!.style!.backgroundImage = `url('${favicon}')`
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

  showRenameTab(tabEl: HTMLElement) {
    tabEl.setAttribute("is-renaming", "")
    tabEl.setAttribute("data-original-value", tabEl.textContent?.trim() || "")
    const titleEl = tabEl.querySelector(".chrome-tab-title") as HTMLDivElement
    const inputEl = tabEl.querySelector(
      ".chrome-tab-rename",
    ) as HTMLInputElement
    const closeEl = tabEl.querySelector(".chrome-tab-close") as HTMLDivElement
    titleEl.style.display = "none"
    inputEl.style.display = "block"
    closeEl.style.display = "none"
    inputEl.focus()
    inputEl.select()
  }

  hideRenameTab(tabEl: HTMLElement) {
    tabEl.removeAttribute("is-renaming")
    const titleEl = tabEl.querySelector(".chrome-tab-title") as HTMLDivElement
    const inputEl = tabEl.querySelector(
      ".chrome-tab-rename",
    ) as HTMLInputElement
    if (tabEl.getAttribute("data-original-value")) {
      inputEl.value = tabEl.getAttribute("data-original-value") || ""
    }
    const closeEl = tabEl.querySelector(".chrome-tab-close") as HTMLDivElement
    titleEl.style.display = "block"
    inputEl.style.display = "none"
    closeEl.style.display = this.tabEls.length > 1 ? "block" : "none"
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

  setupDraggabilly() {
    const tabEls = this.tabEls
    const tabPositions = this.tabPositions

    if (this.isDragging) {
      this.isDragging = false
      this.el.classList.remove("chrome-tabs-is-sorting")
      this.draggabillyDragging.element.classList.remove(
        "chrome-tab-is-dragging",
      )
      this.draggabillyDragging.element.style.transform = ""
      this.draggabillyDragging.dragEnd()
      this.draggabillyDragging.isDragging = false
      this.draggabillyDragging.positionDrag = noop // Prevent Draggabilly from updating tabEl.style.transform in later frames
      this.draggabillyDragging.destroy()
      this.draggabillyDragging = null
    }

    this.draggabillies.forEach((d) => d.destroy())

    tabEls.forEach((tabEl, originalIndex) => {
      const originalTabPositionX = tabPositions[originalIndex]
      const draggabilly = new Draggabilly(tabEl, {
        axis: "x",
        handle: ".chrome-tab-drag-handle",
        containment: this.tabContentEl,
      })

      let lastClickX: number
      let lastClickY: number
      let lastTimeStamp: number = 0
      let wasActiveBefore: boolean

      this.draggabillies.push(draggabilly)

      draggabilly.on("pointerDown", (_, pointer) => {
        // @ts-ignore
        const timeStamp = pointer.timeStamp
        if (_.target === tabEl.querySelector(".chrome-tab-drag-handle")) {
          if (
            lastClickX === pointer.clientX &&
            lastClickY === pointer.clientY &&
            timeStamp - lastTimeStamp < 500 &&
            wasActiveBefore
          ) {
            tabEls.forEach((el) => this.hideRenameTab(el))
            this.showRenameTab(tabEl)
            _.stopImmediatePropagation()
            wasActiveBefore = false
          } else {
            this.tabEls.forEach((tabEl) => this.hideRenameTab(tabEl))
          }
          wasActiveBefore = tabEl.hasAttribute("active")
          lastClickX = pointer.clientX
          lastClickY = pointer.clientY
          lastTimeStamp = timeStamp
        }
        this.emit("tabClick", { tabEl })
        // this.setCurrentTab(tabEl);
      })

      draggabilly.on("dragStart", (_) => {
        this.isDragging = true
        this.draggabillyDragging = draggabilly
        tabEl.classList.add("chrome-tab-is-dragging")
        this.el.classList.add("chrome-tabs-is-sorting")
        this.emit("dragStart", {})
      })

      draggabilly.on("dragEnd", (_) => {
        this.isDragging = false
        const finalTranslateX = parseFloat(tabEl.style.left)
        tabEl.style.transform = `translate3d(0, 0, 0)`
        this.emit("dragEnd", {})

        // Animate dragged tab back into its place
        requestAnimationFrame((_) => {
          tabEl.style.left = "0"
          tabEl.style.transform = `translate3d(${finalTranslateX}px, 0, 0)`

          requestAnimationFrame((_) => {
            tabEl.classList.remove("chrome-tab-is-dragging")
            this.el.classList.remove("chrome-tabs-is-sorting")

            tabEl.classList.add("chrome-tab-was-just-dragged")

            requestAnimationFrame((_) => {
              tabEl.style.transform = ""

              this.layoutTabs()
              this.setupDraggabilly()
            })
          })
        })
      })

      draggabilly.on("dragMove", (event, pointer, moveVector) => {
        // Current index be computed within the event since it can change during the dragMove
        const tabEls = this.tabEls
        const currentIndex = tabEls.indexOf(tabEl)

        const currentTabPositionX = originalTabPositionX + moveVector.x
        const destinationIndexTarget = closest(
          currentTabPositionX,
          tabPositions,
        )
        const destinationIndex = Math.max(
          0,
          Math.min(tabEls.length, destinationIndexTarget),
        )

        if (currentIndex !== destinationIndex) {
          this.animateTabMove(tabEl, currentIndex, destinationIndex)
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
      tabEl!.parentNode!.insertBefore(tabEl, this.tabEls[destinationIndex])
    } else {
      tabEl!.parentNode!.insertBefore(tabEl, this.tabEls[destinationIndex + 1])
    }
    this.emit("tabReorder", { tabEl, originIndex, destinationIndex })
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
