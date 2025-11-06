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
