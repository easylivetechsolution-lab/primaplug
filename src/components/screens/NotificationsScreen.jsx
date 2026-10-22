import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BriefcaseBusiness, CheckCheck, AtSign, Layers3 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../supabase'
import { parseTimestamp } from '../../utils/time'
import { showToast } from '../../utils/toast'
import BrandIcon from '../BrandIcon'

const PAGE_SIZE = 40
const JOB_TYPES = new Set(['application', 'accepted', 'rejected', 'receipt', 'review', 'commission', 'gig_referral_payout'])
const FILTERS = [
  { id: 'all', label: 'All', Icon: Bell },
  { id: 'jobs', label: 'Jobs', Icon: BriefcaseBusiness },
  { id: 'my-posts', label: 'My posts', Icon: Layers3 },
  { id: 'mentions', label: 'Mentions', Icon: AtSign },
]

const getNotificationIcon = (type) => {
  switch (type) {
    case 'review': return 'stats'
    case 'application': return 'feed'
    case 'accepted': return 'discover'
    case 'rejected': return 'notifications'
    case 'receipt': return 'mygigs'
    case 'message': return 'chat'
    case 'wallet':
    case 'gig_referral_payout': return 'wallet'
    case 'commission': return 'owed'
    default: return 'notifications'
  }
}

const formatTime = (value) => {
  const date = parseTimestamp(value)
  const elapsed = Math.max(0, Date.now() - date)
  if (elapsed < 60_000) return 'Just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const isMention = (notification, username) => {
  if (String(notification.type || '').toLowerCase().includes('mention')) return true
  if (!username) return false
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionPattern = new RegExp(`(^|\\s)@${escaped}(\\b|$)`, 'i')
  return mentionPattern.test(`${notification.title || ''} ${notification.message || ''}`)
}

export default function NotificationsScreen({ onNavigate }) {
  const { user, profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [myGigIds, setMyGigIds] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const fetchMyGigs = useCallback(async (rows) => {
    const ids = [...new Set(rows.map(row => row.gig_id).filter(Boolean))]
    if (!ids.length || !user) return
    const { data } = await supabase
      .from('gigs')
      .select('id')
      .eq('poster_id', user.id)
      .in('id', ids)
    if (data) setMyGigIds(previous => new Set([...previous, ...data.map(gig => gig.id)]))
  }, [user])

  const fetchPage = useCallback(async (reset = false) => {
    if (!user) return
    const offset = reset ? 0 : notifications.length
    if (reset) setLoading(true)
    else setLoadingMore(true)

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      showToast('Could not load notifications', 'error')
    } else {
      const rows = data || []
      setNotifications(previous => reset ? rows : [...previous, ...rows])
      setHasMore(rows.length === PAGE_SIZE)
      fetchMyGigs(rows)
    }

    setLoading(false)
    setLoadingMore(false)
  }, [user, notifications.length, fetchMyGigs])

  useEffect(() => {
    setNotifications([])
    setMyGigIds(new Set())
    setHasMore(true)
    fetchPage(true)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notification-page-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, payload => {
        const row = payload.new
        setNotifications(previous => [row, ...previous.filter(item => item.id !== row.id)])
        fetchMyGigs([row])
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, payload => {
        setNotifications(previous => previous.map(row => row.id === payload.new.id ? payload.new : row))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user, fetchMyGigs])

  const filteredNotifications = useMemo(() => notifications.filter(notification => {
    if (filter === 'jobs') return JOB_TYPES.has(notification.type) || Boolean(notification.gig_id)
    if (filter === 'my-posts') return Boolean(notification.gig_id && myGigIds.has(notification.gig_id))
    if (filter === 'mentions') return isMention(notification, profile?.username)
    return true
  }), [notifications, filter, myGigIds, profile?.username])

  const markRead = async (notification) => {
    if (notification.read) return
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notification.id)
    if (error) {
      showToast('Could not update notification', 'error')
      return
    }
    setNotifications(previous => previous.map(row => row.id === notification.id ? { ...row, read: true } : row))
    window.dispatchEvent(new CustomEvent('notificationsChanged'))
  }

  const markAllRead = async () => {
    const { error } = await supabase
      .from('notifications').update({ read: true })
      .eq('user_id', user.id).eq('read', false)
    if (error) {
      showToast('Could not mark notifications as read', 'error')
      return
    }
    setNotifications(previous => previous.map(row => ({ ...row, read: true })))
    window.dispatchEvent(new CustomEvent('notificationsChanged'))
  }

  const openNotification = async (notification) => {
    await markRead(notification)
    const go = (screen) => onNavigate?.(screen)
    const titleAndMessage = `${notification.title || ''} ${notification.message || ''}`.toLowerCase()

    if (notification.type === 'message') {
      go('chat')
      if (notification.conversation_id) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('openChat', { detail: { convoId: notification.conversation_id } }))
        }))
      }
      return
    }
    if (notification.type === 'wallet' || notification.type === 'gig_referral_payout') {
      go('wallet')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openWalletTransaction', {
          detail: {
            id: notification.wallet_transaction_id || null,
            title: notification.title || '',
            message: notification.message || '',
          }
        }))
      }))
      return
    }
    if (notification.type === 'commission') return go('commission')
    if (notification.type === 'application') {
      go('mygigs')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openMyGigNotification', {
          detail: { gigId: notification.gig_id, action: 'applicants' }
        }))
      }))
      return
    }
    if (notification.type === 'accepted' || notification.type === 'rejected') {
      go('mygigs')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openMyGigNotification', {
          detail: { gigId: notification.gig_id, action: 'gig' }
        }))
      }))
      return
    }
    if (notification.type === 'receipt' || titleAndMessage.includes('receipt disput')) {
      go('mygigs')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openMyGigNotification', {
          detail: {
            gigId: notification.gig_id,
            action: 'receipt',
            side: titleAndMessage.includes('disput') ? 'poster' : 'worker',
          }
        }))
      }))
      return
    }
    if (notification.type === 'review') {
      go('mygigs')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openMyGigNotification', {
          detail: { gigId: notification.gig_id, action: 'gig' }
        }))
      }))
      return
    }
    if (notification.type === 'general' && /withdrawal (successful|failed)|wallet funded|wallet has been credited/.test(titleAndMessage)) {
      go('wallet')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openWalletTransaction', {
          detail: {
            id: notification.wallet_transaction_id || null,
            title: notification.title || '',
            message: notification.message || '',
          }
        }))
      }))
      return
    }
    if (notification.type === 'general' && /withdrawal processing|is being sent to your bank/.test(titleAndMessage)) {
      return go('withdrawal')
    }
    if (notification.type === 'general' && /receipt|disput/.test(titleAndMessage) && notification.gig_id) {
      go('mygigs')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openMyGigNotification', {
          detail: { gigId: notification.gig_id, action: 'receipt', side: 'poster' }
        }))
      }))
      return
    }
    if (notification.gig_id) {
      go('feed')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openGigDetail', { detail: notification.gig_id }))
      }))
    }
  }

  const unreadCount = notifications.filter(notification => !notification.read).length

  return (
    <main className="notifications-screen" style={{
      width: 'min(100%, 900px)', margin: '0 auto', padding: '24px 20px 40px',
      boxSizing: 'border-box', color: 'var(--color-text)', fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Notifications</h1>
          <p style={{ margin: '5px 0 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            Updates about jobs, your posts, and conversations.
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{
            border: 'none', background: 'var(--color-brand-soft)', color: 'var(--color-brand)',
            borderRadius: '10px', padding: '8px 12px', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0
          }}><CheckCheck size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Mark all read</button>
        )}
      </header>

      <nav aria-label="Filter notifications" style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 1px 12px', marginBottom: '8px' }}>
        {FILTERS.map(({ id, label, Icon }) => {
          const active = filter === id
          return (
            <button key={id} onClick={() => setFilter(id)} aria-pressed={active} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
              minHeight: '34px', borderRadius: '999px', padding: '6px 13px',
              border: active ? '1px solid var(--color-success)' : '1px solid rgba(108,71,255,0.18)',
              background: active ? 'var(--color-success)' : 'var(--color-surface)',
              color: active ? '#fff' : 'var(--color-text-muted)',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: active ? 700 : 600, cursor: 'pointer'
            }}><Icon size={14} />{label}</button>
          )
        })}
      </nav>

      <section aria-live="polite" style={{ display: 'grid', gap: '10px' }}>
        {loading ? (
          <div style={{ ...emptyStateStyle }}>Loading notifications…</div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ ...emptyStateStyle }}>
            <Bell size={25} color="var(--color-brand)" />
            <strong>{notifications.length ? 'Nothing in this filter yet' : 'You’re all caught up'}</strong>
            <span>{notifications.length ? 'Try another notification filter.' : 'New activity will appear here.'}</span>
          </div>
        ) : filteredNotifications.map(notification => (
          <article key={notification.id} onClick={() => openNotification(notification)} role="button" tabIndex={0}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openNotification(notification) } }}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '13px', padding: '14px 16px',
              borderRadius: '16px', cursor: 'pointer', background: notification.read ? 'var(--color-surface)' : 'var(--color-brand-soft)',
              boxShadow: 'var(--shadow-glass)', transition: 'background 0.15s ease'
            }}>
            <BrandIcon name={getNotificationIcon(notification.type)} size={40} active={!notification.read} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '14px', lineHeight: 1.35 }}>{notification.title || 'Notification'}</strong>
                <time dateTime={notification.created_at} style={{ flexShrink: 0, color: 'var(--color-text-subtle)', fontSize: '11px' }}>
                  {formatTime(notification.created_at)}
                </time>
              </div>
              {notification.message && <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '13px', lineHeight: 1.5 }}>{notification.message}</p>}
              {!notification.read && <span style={{ display: 'inline-block', marginTop: '7px', color: 'var(--color-brand)', fontSize: '11px', fontWeight: 700 }}>New</span>}
            </div>
          </article>
        ))}
      </section>

      {!loading && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
          <button onClick={() => fetchPage(false)} disabled={loadingMore} style={{
            border: '1px solid var(--color-border)', borderRadius: '10px', padding: '9px 15px',
            background: 'var(--color-surface)', color: 'var(--color-brand)', cursor: loadingMore ? 'wait' : 'pointer',
            fontFamily: 'inherit', fontWeight: 700, fontSize: '13px'
          }}>{loadingMore ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
      <style>{`
        @media (max-width: 600px) {
          .notifications-screen { padding: 18px 12px 28px !important; }
        }
      `}</style>
    </main>
  )
}

const emptyStateStyle = {
  minHeight: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: '8px', padding: '24px', borderRadius: '16px', background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-glass)', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '13px'
}
