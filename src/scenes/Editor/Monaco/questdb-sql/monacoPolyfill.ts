/**
 * Minimal browser globals polyfill so that Monaco editor modules
 * can be imported in a Node/vitest environment.
 *
 * Must be loaded via vitest `setupFiles` BEFORE any monaco-editor import.
 */

if (typeof window === "undefined") {
  const g = globalThis as Record<string, unknown>
  g.window = globalThis
  g.self = globalThis

  const define = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    })

  define("navigator", { userAgent: "", language: "en" })
  define("location", {
    href: "http://localhost",
    origin: "http://localhost",
    protocol: "http:",
    host: "localhost",
    hostname: "localhost",
    pathname: "/",
    search: "",
    hash: "",
  })
  define("document", {
    createEvent: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { style: {} },
    body: { appendChild: () => {}, removeChild: () => {} },
    head: { appendChild: () => {}, removeChild: () => {} },
    createElement: (tag: string) => ({
      tagName: tag,
      style: {},
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      classList: { add: () => {}, remove: () => {} },
    }),
    createTextNode: () => ({}),
    createDocumentFragment: () => ({ appendChild: () => {} }),
  })
  define("matchMedia", () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
  define("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0))
  define("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id),
  )
  define("getComputedStyle", () => ({ getPropertyValue: () => "" }))
  define(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  define(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
}
