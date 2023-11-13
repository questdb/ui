export const isCloud = () => {
  return ["cloud.app.questdb.net", "cloud.questdb.com"].includes(
    window.location.hostname,
  )
}
