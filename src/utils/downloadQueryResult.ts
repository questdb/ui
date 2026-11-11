import * as QuestDB from "./questdb"
import { toast } from "../components/Toast"
import { API_VERSION } from "../consts"

// Streams a query's full result from the server's `/exp` endpoint into a file
// download. Uses a hidden iframe GET so the browser session carries auth — no
// header token needed. Shared by the console Result toolbar and notebook cells.
export const downloadQueryResult = (
  query: string,
  format: "csv" | "parquet",
): void => {
  const url = `exp?${QuestDB.Client.encodeParams({
    query,
    version: API_VERSION,
    fmt: format,
    filename: `questdb-query-${Date.now().toString()}`,
    ...(format === "parquet" ? { rmode: "nodelay" } : {}),
  })}`

  const iframe = document.createElement("iframe")
  iframe.style.display = "none"
  document.body.appendChild(iframe)

  iframe.onerror = (e) => {
    toast.error(
      typeof e === "string"
        ? `An error occurred while downloading the file: ${e}`
        : "An error occurred while downloading the file",
    )
    iframe.remove()
  }

  iframe.onload = () => {
    const content = iframe.contentDocument?.body?.textContent
    if (content) {
      let error = "An error occurred while downloading the file"
      try {
        const contentJson = JSON.parse(content) as { error?: string }
        error += `: ${contentJson.error ?? content}`
      } catch (_) {
        error += `: ${content}`
      }
      toast.error(error)
    }
    iframe.remove()
  }

  iframe.src = url
}
