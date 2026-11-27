const PASTE_SINK_TIMEOUT_MS = 500
const PASTE_SINK_ATTRIBUTE = "data-clipboard-paste-sink"

const OFFSCREEN_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "-9999px",
  opacity: "0",
}

// Safari fires a copy event only when there is a selection (WebKit 156529), so
// the holder gives execCommand one to copy from.
export const writeClipboardData = (data: Record<string, string>): void => {
  const holder = document.createElement("span")
  holder.textContent = " "
  Object.assign(holder.style, OFFSCREEN_STYLE, {
    userSelect: "text",
    whiteSpace: "pre",
  })
  const fillClipboard = (event: ClipboardEvent) => {
    event.preventDefault()
    Object.entries(data).forEach(([type, value]) =>
      event.clipboardData?.setData(type, value),
    )
  }
  document.body.appendChild(holder)
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(holder)
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.addEventListener("copy", fillClipboard, true)
  try {
    document.execCommand("copy")
  } finally {
    document.removeEventListener("copy", fillClipboard, true)
    selection?.removeAllRanges()
    holder.remove()
  }
}

export const isPasteSink = (element: Element): boolean =>
  element.hasAttribute(PASTE_SINK_ATTRIBUTE)

// Safari and older Firefox fire no paste event outside editable elements
// (WebKit 75891). Moving focus to a hidden textarea during keydown makes the
// browser paste into it, which fires the event everywhere.
export const redirectNextPaste = (
  onPaste: (data: DataTransfer) => void,
): void => {
  const returnFocusTo =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  const sink = document.createElement("textarea")
  sink.setAttribute(PASTE_SINK_ATTRIBUTE, "true")
  sink.setAttribute("aria-hidden", "true")
  sink.tabIndex = -1
  Object.assign(sink.style, OFFSCREEN_STYLE)

  let released = false
  const release = () => {
    if (released) return
    released = true
    window.clearTimeout(timeout)
    sink.remove()
    returnFocusTo?.focus({ preventScroll: true })
  }
  sink.addEventListener("paste", (event) => {
    event.preventDefault()
    release()
    if (event.clipboardData) onPaste(event.clipboardData)
  })
  document.body.appendChild(sink)
  sink.focus({ preventScroll: true })
  const timeout = window.setTimeout(release, PASTE_SINK_TIMEOUT_MS)
}
