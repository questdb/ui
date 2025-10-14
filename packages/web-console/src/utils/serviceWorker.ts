let serviceWorkerRegistration: ServiceWorkerRegistration | null = null

export const registerDownloadServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers are not supported in this browser')
    return
  }

  try {
    const registration = await navigator.serviceWorker.register('/download-sw.js', {
      scope: '/',
    })
    serviceWorkerRegistration = registration

    await navigator.serviceWorker.ready
  } catch (error) {
    console.error('Service Worker registration failed:', error)
  }
}

export const getIsServiceWorkerReady = () => {
  return serviceWorkerRegistration !== null && serviceWorkerRegistration.active !== null
}

export const setServiceWorkerAuth = (token: string, timeoutMs: number = 2000): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!getIsServiceWorkerReady()) {
      return reject()
    }
    let resolved = false

    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'AUTH_TOKEN_ACK') {
        resolved = true
        cleanup()
        resolve()
      }
    }
    const cleanup = () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)

    serviceWorkerRegistration?.active?.postMessage({
      type: 'SET_AUTH_TOKEN',
      token,
    })

    setTimeout(() => {
      if (!resolved) {
        console.warn('[SW] Auth token ack timed out')
        cleanup()
        reject()
      }
    }, timeoutMs)
  })
}
