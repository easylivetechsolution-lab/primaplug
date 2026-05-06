import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function NotificationBell() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!user) return
    fetchNotifications()

    const channel = supabase
      .channel('notifications-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
        setUnread(prev => prev + 1)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) {
      setNotifications(data)
      setUnread(data.filter(n => !n.read).length)
    }
  }

  const markAllRead = async () => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  const markRead = async (id) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
    setUnread(prev => Math.max(0, prev - 1))
  }

  const getIcon = (type) => {
    switch(type) {
      case 'review': return '⭐'
      case 'application': return '⚡'
      case 'accepted': return '✅'
      case 'rejected': return '❌'
      case 'receipt': return '📎'
      case 'message': return '💬'
      default: return '🔔'
    }
  }

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`
    return `${Math.floor(seconds/86400)}d ago`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setOpen(o => !o)
          if (!open && unread > 0) markAllRead()
        }}
        style={{
          width: '38px', height: '38px',
          borderRadius: '10px',
          background: unread > 0 ? '#EEE9FF' : '#F5F4FF',
          border: `1.5px solid ${unread > 0 ? '#B8A5FF' : '#E2E0FF'}`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          position: 'relative', transition: 'all 0.15s',
          fontFamily: 'inherit'
        }}>
        <span style={{ fontSize: '18px' }}>🔔</span>
        {unread > 0 && (
          <div style={{
            position: 'absolute', top: '-4px', right: '-4px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: '#FF3366', border: '2px solid #fff',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px', fontWeight: '800', color: '#fff'
          }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '44px', right: 0,
          width: '320px', background: '#fff',
          borderRadius: '16px', border: '1.5px solid #E2E0FF',
          boxShadow: '0 12px 40px rgba(108,71,255,0.15)',
          zIndex: 200, overflow: 'hidden',
          animation: 'notifDrop 0.2s ease',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #F5F4FF'
          }}>
            <div style={{
              fontSize: '14px', fontWeight: '800', color: '#14123A'
            }}>Notifications</div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background: 'none', border: 'none',
                fontSize: '11px', color: '#6C47FF',
                fontWeight: '600', cursor: 'pointer',
                fontFamily: 'inherit'
              }}>Mark all read</button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '32px 16px', textAlign: 'center',
                color: '#A09DC8', fontSize: '13px'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  style={{
                    padding: '12px 16px',
                    background: notif.read ? '#fff' : '#F8F7FF',
                    borderBottom: '1px solid #F5F4FF',
                    cursor: 'pointer', transition: 'background 0.1s',
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = notif.read ? '#fff' : '#F8F7FF'}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: '#EEE9FF', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', flexShrink: 0
                  }}>
                    {getIcon(notif.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: notif.read ? '500' : '700',
                      color: '#14123A', marginBottom: '2px',
                      lineHeight: '1.3'
                    }}>{notif.title}</div>
                    <div style={{
                      fontSize: '11px', color: '#8B8FAF',
                      lineHeight: '1.4', marginBottom: '3px'
                    }}>{notif.message}</div>
                    <div style={{
                      fontSize: '10px', color: '#A09DC8', fontWeight: '500'
                    }}>{timeAgo(notif.created_at)}</div>
                  </div>
                  {!notif.read && (
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#6C47FF', flexShrink: 0, marginTop: '4px'
                    }} />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: '10px 16px', borderTop: '1px solid #F5F4FF',
              textAlign: 'center'
            }}>
              <button
                onClick={async () => {
                  await supabase
                    .from('notifications')
                    .delete()
                    .eq('user_id', user.id)
                  setNotifications([])
                  setUnread(0)
                }}
                style={{
                  background: 'none', border: 'none',
                  fontSize: '11px', color: '#A09DC8',
                  cursor: 'pointer', fontFamily: 'inherit'
                }}>Clear all notifications</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes notifDrop {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}