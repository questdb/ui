let serviceWorkerRegistration: ServiceWorkerRegistration | null = null
let currentAuthToken: string | null = null

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

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Controller changed')
      sendAuthTokenToServiceWorker()
    })

    await navigator.serviceWorker.ready
    sendAuthTokenToServiceWorker()
  } catch (error) {
    console.error('Service Worker registration failed:', error)
  }
}

export const getIsServiceWorkerReady = () => {
  return serviceWorkerRegistration !== null && serviceWorkerRegistration.active !== null
}

const sendAuthTokenToServiceWorker = (): void => {
  if (!serviceWorkerRegistration?.active) {
    return
  }

  serviceWorkerRegistration.active.postMessage({
    type: 'SET_AUTH_TOKEN',
    token: currentAuthToken,
  })
}

export const updateServiceWorkerAuthToken = (token: string) => {
  currentAuthToken = token

  if (getIsServiceWorkerReady()) {
    sendAuthTokenToServiceWorker()
  }
}
