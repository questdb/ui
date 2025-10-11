let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let pendingAuthToken: string | null = null;

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
    await processPendingAuthToken()
  } catch (error) {
    console.error('Service Worker registration failed:', error)
  }
}

export const getIsServiceWorkerReady = () => {
  return serviceWorkerRegistration !== null && serviceWorkerRegistration.active !== null
}

const processPendingAuthToken = async (): Promise<void> => {
  if (!serviceWorkerRegistration?.active) {
    return
  }

  if (pendingAuthToken) {
    serviceWorkerRegistration.active?.postMessage({
      type: 'SET_AUTH_TOKEN',
      token: pendingAuthToken,
    })
    pendingAuthToken = null
  }
}

export const updateServiceWorkerAuthToken = (token: string) => {
  pendingAuthToken = token

  if (getIsServiceWorkerReady()) {
    serviceWorkerRegistration?.active?.postMessage({
      type: 'SET_AUTH_TOKEN',
      token: token,
    })
    pendingAuthToken = null
  }
}