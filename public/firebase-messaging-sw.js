importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js')

let app = null
let messaging = null

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    try {
      if (!firebase.apps.length) {
        app = firebase.initializeApp(event.data.config)
      } else {
        app = firebase.apps[0]
      }
      messaging = firebase.messaging()

      messaging.onBackgroundMessage((payload) => {
        const { title, body } = payload.notification || {}
        self.registration.showNotification(title || 'PrimaPlug', {
          body: body || 'You have a new notification',
          icon: '/prima-logo.png',
          vibrate: [200, 100, 200],
        })
      })
    } catch (e) {
      console.log('SW Firebase init error:', e)
    }
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const data = event.data.json()
    const title = data?.notification?.title || 'PrimaPlug'
    const body = data?.notification?.body || 'You have a new notification'
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/prima-logo.png',
        vibrate: [200, 100, 200],
      })
    )
  } catch (e) {
    console.log('Push event error:', e)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow('https://primaplug.com/dashboard')
    })
  )
})
