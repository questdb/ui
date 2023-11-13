export const isCloud = () => {
  return /questdb\.(net|com)$/.test(window.location.hostname)
}
