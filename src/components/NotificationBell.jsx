import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import {
  playNotification,
  playAccepted,
  playDeclined,
  playReceipt,
  playComplete,
  playMessage,
} from '../utils/sounds'

export default function NotificationBell({ onNavigate, active = false }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0)
      return
    }

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (!error) setUnreadCount(count || 0)
  }, [user])

  useEffect(() => {
    refreshUnreadCount()
    const handleChange = () => refreshUnreadCount()
    window.addEventListener('notificationsChanged', handleChange)

    if (!user) return () => window.removeEventListener('notificationsChanged', handleChange)

    const channel = supabase
      .channel(`notification-badge-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        refreshUnreadCount()
        if (payload.eventType !== 'INSERT') return

        const type = payload.new?.type
        if (type === 'accepted') playAccepted()
        else if (type === 'rejected') playDeclined()
        else if (type === 'receipt') playReceipt()
        else if (type === 'review') playComplete()
        else if (type === 'application' || type === 'message') playMessage()
        else playNotification()
      })
      .subscribe()

    return () => {
      window.removeEventListener('notificationsChanged', handleChange)
      supabase.removeChannel(channel)
    }
  }, [user, refreshUnreadCount])

  return (
    <button
      type="button"
      onClick={() => onNavigate?.('notifications')}
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      title="Notifications"
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 42, height: 42, border: 'none', borderRadius: 14,
        background: active ? 'var(--color-brand-gradient)' : 'var(--color-surface, #fff)',
        color: active ? 'var(--color-surface)' : 'var(--color-text, #222)',
        boxShadow: active ? '0 5px 15px rgba(108, 71, 255, 0.28)' : '0 4px 14px rgba(34, 24, 73, 0.12)',
        cursor: 'pointer',
      }}
    >
      <Bell size={20} strokeWidth={2} aria-hidden="true" />
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px',
          display: 'grid', placeItems: 'center', borderRadius: 999,
          background: 'var(--color-error, #d92352)', color: '#fff',
          fontSize: 10, fontWeight: 700, lineHeight: 1,
        }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
