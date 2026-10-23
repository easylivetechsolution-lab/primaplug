export const DEFAULT_NOTIFICATION_PREFERENCES = {
  applications: true,
  statusUpdates: true,
  messages: true,
  receipts: true,
  reviews: true,
  newGigs: true,
  sounds: true,
}

export const notificationPreferenceEnabled = (notification, preferences = DEFAULT_NOTIFICATION_PREFERENCES) => {
  const type = String(notification?.type || '').toLowerCase()
  const text = `${notification?.title || ''} ${notification?.message || ''}`.toLowerCase()

  if (type === 'application') return preferences.applications !== false
  if (type === 'accepted' || type === 'rejected') return preferences.statusUpdates !== false
  if (type === 'message') return preferences.messages !== false
  if (type === 'receipt' || text.includes('receipt') || text.includes('dispute')) return preferences.receipts !== false
  if (type === 'review') return preferences.reviews !== false
  if (/new gig|gigs? nearby|gig posted/.test(text)) return preferences.newGigs !== false
  return true
}
