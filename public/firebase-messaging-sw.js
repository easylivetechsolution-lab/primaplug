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
          data: payload.data || {},
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
    const payload = event.data.json()
    const title = payload?.notification?.title || 'PrimaPlug'
    const body = payload?.notification?.body || 'You have a new notification'
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/prima-logo.png',
        vibrate: [200, 100, 200],
        data: payload?.data || {},
      })
    )
  } catch (e) {
    console.log('Push event error:', e)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const notifData = event.notification.data || {}
  const notifType = notifData.type || ''

  const screenMap = {
    message: 'chat',
    wallet: 'wallet',
    receipt: 'mygigs',
    review: 'mygigs',
    commission: 'commission',
    application: 'mygigs',
    accepted: 'feed',
    rejected: 'feed',
  }
  const targetScreen = screenMap[notifType] || 'feed'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.postMessage({
            type: 'PUSH_NAVIGATE',
            screen: targetScreen,
            gigId: notifData.gigId || notifData.gig_id || null,
            conversationId: notifData.conversationId || notifData.conversation_id || null,
          })
          return
        }
      }
      const targetUrl = new URL('/dashboard', self.location.origin)
      targetUrl.searchParams.set('screen', targetScreen)
      if (notifData.gigId || notifData.gig_id) {
        targetUrl.searchParams.set('gigId', notifData.gigId || notifData.gig_id)
      }
      if (notifData.conversationId || notifData.conversation_id) {
        targetUrl.searchParams.set('conversationId', notifData.conversationId || notifData.conversation_id)
      }
      return clients.openWindow(targetUrl.href)
    })
  )
})
