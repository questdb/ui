export const readExampleLink = (search: string) => {
  const params = new URLSearchParams(search)
  return {
    templateId: params.get("templateId") || undefined,
    hasQuery: !!params.get("query"),
  }
}

export const clearExampleLinkParams = () => {
  const url = new URL(window.location.href)
  if (!url.searchParams.has("templateId")) return
  url.searchParams.delete("templateId")
  history.replaceState(null, "", url.pathname + url.search + url.hash)
}
