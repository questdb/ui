import { connectQwpBrowserEgress } from "@questdb/browser-client"
import { getValue } from "../../localStorage"
import { StoreKey } from "../../localStorage/types"
import { QwpTransport } from "./transport"

/** QWP is on unless this browser turned it off, to use HTTP only. */
export const isQwpEnabled = () => getValue(StoreKey.USE_QWP) !== "false"

/** The QWP query endpoint beside the console's `exec`, on the same origin. */
export const qwpEgressUrl = (base: string) => {
  const url = new URL("read/v1", base)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url
}

/**
 * Opens QWP query connections from the console's page. The browser sends the
 * console's cookie session with each upgrade, as it does with `exec`
 * requests, so a connection runs as the signed-in user.
 */
export const createBrowserQwpTransport = () =>
  new QwpTransport((signal) =>
    connectQwpBrowserEgress(
      {
        url: qwpEgressUrl(document.baseURI),
        // A lost connection fails its query rather than running it again:
        // a statement the console sent must not execute twice.
        reconnect: false,
        // Zstd decompression runs on the page's main thread, and costs more
        // than it saves on a local network.
        compression: "raw",
        connectTimeoutMs: 10_000,
      },
      signal,
    ),
  )
