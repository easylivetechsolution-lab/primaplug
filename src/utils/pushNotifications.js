import { messaging, getToken, onMessage } from '../firebase'
import { supabase } from '../supabase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

// Register service worker and get FCM token
export const initPushNotifications = async (userId) => {
  try {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
      console.log('Browser does not support notifications')
      return null
    }

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.log('Service workers not supported')
      return null
    }

    // Request permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('Notification permission denied')
      return null
    }

    // Register service worker with Firebase config
    const swUrl = '/firebase-messaging-sw.js'
    const registration = await navigator.serviceWorker.register(swUrl)
    console.log('Service worker registered:', registration)

    // Pass config to service worker
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
    const sw = registration.installing || registration.waiting || registration.active
    if (sw) {
      if (sw.state === 'activated') {
        sw.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig })
      } else {
        sw.addEventListener('statechange', function () {
          if (this.state === 'activated') {
            this.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig })
          }
        })
      }
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    })

    if (!token) {
      console.log('No FCM token received')
      return null
    }

    console.log('FCM token:', token)

    // Save token to database
    await savePushToken(userId, token)

    return token
  } catch (error) {
    console.error('Push notification init error:', error)
    return null
  }
}

// Save token to Supabase
export const savePushToken = async (userId, token) => {
  if (!userId || !token) return

  await supabase
    .from('push_tokens')
    .upsert({
      user_id: userId,
      token,
      device: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,token' })
}

// Listen for foreground messages
export const listenForMessages = (callback) => {
  return onMessage(messaging, (payload) => {
    console.log('Foreground message:', payload)
    callback(payload)
  })
}

// Send push notification via Supabase Edge Function
export const sendPushToUser = async (userId, title, body, data = {}) => {
  try {
    await supabase.functions.invoke('send-push', {
      body: { userId, title, body, data }
    })
  } catch (error) {
    console.error('Send push error:', error)
  }
}