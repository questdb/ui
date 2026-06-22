export const canReadFromClipboard = (): boolean =>
  Boolean(navigator.clipboard) && window.isSecureContext

export const readFromClipboard = (): Promise<string> => {
  if (!canReadFromClipboard()) {
    return Promise.reject(
      new Error("Clipboard read requires HTTPS or a secure context."),
    )
  }
  return navigator.clipboard.readText()
}

export const copyToClipboard = (textToCopy: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (navigator.clipboard && window.isSecureContext) {
      // Safari needs Transient Activation for writing to clipboard, pushing the write to callback queue
      // as a workaround
      setTimeout(() => {
        navigator.clipboard.writeText(textToCopy).then(resolve).catch(reject)
      })
    } else {
      const textArea = document.createElement("textarea")
      textArea.value = textToCopy

      textArea.style.position = "absolute"
      textArea.style.left = "-999999px"
      document.body.prepend(textArea)
      textArea.select()

      try {
        const success = document.execCommand("copy")
        if (success) {
          resolve()
        } else {
          reject(new Error("Copy command failed"))
        }
      } catch (error) {
        reject(error)
      } finally {
        textArea.remove()
      }
    }
  })
}
