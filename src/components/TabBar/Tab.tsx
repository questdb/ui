import React, { useRef, useState } from "react"
import type { TabProperties } from "./types"

type Props = {
  tab: TabProperties
  style: React.CSSProperties
  className: string
  closable: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onRename: (id: string, title: string) => void
  onContextMenu: (id: string, event: React.MouseEvent) => void
  onHandlePointerDown: (event: React.PointerEvent<HTMLElement>) => void
}

const isRenameable = (tab: TabProperties) =>
  !tab.className?.includes("temporary-tab") &&
  !tab.className?.includes("preview-tab")

const faviconClassName = (tab: TabProperties) =>
  tab.faviconClass
    ? `chrome-tab-favicon ${tab.faviconClass}`
    : "chrome-tab-favicon"

export const Tab = ({
  tab,
  style,
  className,
  closable,
  onActivate,
  onClose,
  onRename,
  onContextMenu,
  onHandlePointerDown,
}: Props) => {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(tab.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const showFavicon = Boolean(tab.favicon || tab.faviconClass)

  const startRename = () => {
    if (!isRenameable(tab)) return
    setDraft(tab.title)
    setRenaming(true)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  const commitRename = () => {
    if (!renaming) return
    const title = draft.trim()
    setRenaming(false)
    if (title !== "" && title !== tab.title) {
      onRename(tab.id, title)
    }
  }

  const cancelRename = () => {
    setDraft(tab.title)
    setRenaming(false)
  }

  return (
    <div
      className={className}
      style={style}
      role="tab"
      aria-selected={tab.active === true}
      tabIndex={-1}
      data-tab-id={tab.id}
      data-tab-title={tab.title}
      {...(tab.active ? { active: "" } : {})}
      {...(renaming ? { "is-renaming": "" } : {})}
      onContextMenu={(event) => onContextMenu(tab.id, event)}
    >
      <div className="chrome-tab-content">
        <div
          className={faviconClassName(tab)}
          style={
            typeof tab.favicon === "string"
              ? { backgroundImage: `url('${tab.favicon}')` }
              : undefined
          }
          {...(showFavicon ? {} : { hidden: true })}
        />
        <div
          className="chrome-tab-title"
          style={{ display: renaming ? "none" : "block" }}
        >
          {tab.title}
        </div>
        <input
          ref={inputRef}
          className="chrome-tab-rename"
          type="text"
          value={draft}
          placeholder={tab.title}
          style={{ display: renaming ? "block" : "none" }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft !== "") {
              event.preventDefault()
              commitRename()
            } else if (event.key === "Escape") {
              event.preventDefault()
              cancelRename()
            }
          }}
        />
        <div
          className="chrome-tab-drag-handle"
          role="presentation"
          onPointerDown={(event) => {
            onActivate(tab.id)
            onHandlePointerDown(event)
          }}
          onDoubleClick={startRename}
        />
        <div
          className="chrome-tab-edit"
          role="button"
          tabIndex={-1}
          aria-label="Rename tab"
          style={{ display: renaming ? "none" : "" }}
          onClick={(event) => {
            event.stopPropagation()
            startRename()
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") startRename()
          }}
        />
        <div
          className="chrome-tab-close"
          role="button"
          tabIndex={-1}
          aria-label="Close tab"
          style={{ display: closable && !renaming ? "block" : "none" }}
          onClick={(event) => {
            event.stopPropagation()
            onClose(tab.id)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") onClose(tab.id)
          }}
        />
      </div>
    </div>
  )
}
