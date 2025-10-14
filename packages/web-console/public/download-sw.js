let authToken = null

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_AUTH_TOKEN') {
    authToken = event.data.token
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'AUTH_TOKEN_ACK',
        })
      })
    })
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.searchParams.get('noAuth')) {
    return
  }

  if (url.pathname === '/exp' || url.pathname.endsWith('/exp')) {
    const requestKey = new URL(event.request.url).searchParams.get('filename')

    event.respondWith(
      (async () => {
        try {
          const headers = new Headers(event.request.headers)
          if (authToken) {
            headers.set('Authorization', authToken)
          }

          const modifiedRequest = new Request(event.request, {
            headers: headers,
          })

          const response = await fetch(modifiedRequest)

          if (!response.ok) {
            let message = response.statusText
            try {
              const json = await response.json()
              const errorMessage = json.error
              if (errorMessage) {
                message = errorMessage
              }
            } catch (_) {}

            self.clients.matchAll().then((clients) => {
              clients.forEach((client) => {
                client.postMessage({
                  type: `DOWNLOAD_ERROR_${requestKey}`,
                  status: response.status,
                  message,
                })
              })
            })
          } else {
            self.clients.matchAll().then((clients) => {
              clients.forEach((client) => {
                client.postMessage({
                  type: `DOWNLOAD_START_${requestKey}`,
                })
              })
            })
          }
          return response
        } catch (error) {
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: `DOWNLOAD_ERROR_${requestKey}`,
                status: 500,
                message: error.message ?? 'Internal server error',
              })
            })
          })
          console.error('[SW] Download service worker error:', error)
        }
      })()
    );
  }
});

self.addEventListener('install', (_) => {
  self.skipWaiting()
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
});
