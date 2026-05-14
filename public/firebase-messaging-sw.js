importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js')

// Receive Firebase config from main thread and initialize
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    if (!firebase.apps.length) {
      firebase.initializeApp(event.data.config)
      const messaging = firebase.messaging()

      messaging.onBackgroundMessage((payload) => {
        const { title, body, icon, data } = payload.notification || {}
        self.registration.showNotification(title || 'PrimaPlug', {
          body: body || 'You have a new notification',
          icon: icon || '/prima-icon.png',
          badge: '/prima-badge.png',
          data: data || {},
          vibrate: [200, 100, 200],
          actions: [
            { action: 'open', title: 'Open Prima' },
            { action: 'close', title: 'Dismiss' }
          ]
        })
      })
    }
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('primaplug') && 'focus' in client) {
            return client.focus()
          }
        }
        return clients.openWindow('https://primaplug.vercel.app/dashboard')
      })
    )
  }
})
