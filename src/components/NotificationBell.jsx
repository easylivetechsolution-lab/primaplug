import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import PublicProfile from './PublicProfile'
import BrandIcon from './BrandIcon'
import { showToast } from '../utils/toast'
import { ensureGigConversation } from '../utils/gigApplications'
import { parseTimestamp } from '../utils/time'
import {
  playNotification,
  playAccepted,
  playDeclined,
  playReceipt,
  playComplete,
  playMessage
} from '../utils/sounds'

export default function NotificationBell({ onNavigate }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifDetail, setNotifDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [actionDone, setActionDone] = useState(null)
  const ref = useRef()

  async function fetchNotifications() {
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

  useEffect(() => {
    if (!user) return
    Promise.resolve().then(fetchNotifications)

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

        // Play sound based on notification type
        const type = payload.new?.type
        if (type === 'accepted') playAccepted()
        else if (type === 'rejected') playDeclined()
        else if (type === 'receipt') playReceipt()
        else if (type === 'review') playComplete()
        else if (type === 'application') playMessage()
        else if (type === 'message') playMessage()
        else playNotification()
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

  useEffect(() => {
    if (!notifDetail) return
    window.history.pushState({ modal: 'notification-detail' }, '', '')
    const handleBack = () => { setNotifDetail(null); setActionDone(null) }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [!!notifDetail])

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
      case 'review': return 'stats'
      case 'application': return 'feed'
      case 'accepted': return 'discover'
      case 'rejected': return 'notifications'
      case 'receipt': return 'mygigs'
      case 'message': return 'chat'
      default: return 'notifications'
    }
  }

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - parseTimestamp(date)) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`
    return `${Math.floor(seconds/86400)}d ago`
  }

  const openMessageNotification = async (notif) => {
    if (!user) return

    if (notif.conversation_id) {
      onNavigate && onNavigate('chat')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('openChat', {
            detail: { convoId: notif.conversation_id }
          }))
        })
      })
      return
    }

    let query = supabase
      .from('conversations')
      .select('id, gig_id, last_message, last_message_at, participant_1, participant_2')
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order('last_message_at', { ascending: false })
      .limit(5)

    if (notif.gig_id) query = query.eq('gig_id', notif.gig_id)

    const { data } = await query
    if (!data || data.length === 0) {
      onNavigate && onNavigate('chat')
      return
    }

    const snippet = (notif.message || '').replace(/\.\.\.$/, '')
    const convo = data.find(c => snippet && c.last_message?.startsWith(snippet)) || data[0]

    onNavigate && onNavigate('chat')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('openChat', {
          detail: { convoId: convo.id }
        }))
      })
    })
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
          width: '48px', height: '48px',
          borderRadius: '14px',
          background: unread > 0
            ? 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 52%, var(--color-brand-highlight) 100%)'
            : 'var(--color-page)',
          border: `1.5px solid ${unread > 0 ? 'rgba(255,255,255,0.65)' : 'var(--color-border)'}`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          position: 'relative', transition: 'all 0.15s',
          boxShadow: unread > 0
            ? 'inset 0 1px 0 rgba(255,255,255,0.42), 0 8px 24px rgba(108,71,255,0.32)'
            : '0 3px 12px rgba(108,71,255,0.08)',
          fontFamily: 'inherit'
        }}>
        <span style={{
          display: 'inline-flex',
          animation: unread > 0 ? 'bellring 1s ease infinite' : 'none'
        }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M10.2 20.2h11.6l-1.6-1.8v-5.1A4.2 4.2 0 0 0 16 9.1a4.2 4.2 0 0 0-4.2 4.2v5.1l-1.6 1.8Z"
              fill={unread > 0 ? 'var(--color-surface)' : 'var(--color-brand)'}
            />
            <path
              d="M13.8 22.2c.5.9 1.2 1.4 2.2 1.4s1.7-.5 2.2-1.4"
              stroke={unread > 0 ? 'var(--color-surface)' : 'var(--color-brand)'}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M12.7 11c.8-1 1.9-1.6 3.3-1.6s2.5.6 3.3 1.6"
              stroke={unread > 0 ? 'rgba(255,255,255,0.72)' : 'var(--color-brand-border-strong)'}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {unread > 0 && (
          <div style={{
            position: 'absolute', top: '-5px', right: '-5px',
            width: unread > 9 ? '24px' : '20px',
            height: '20px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-danger), var(--color-brand-highlight))',
            border: '2px solid #fff',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px', fontWeight: '800', color: 'var(--color-surface)',
            boxShadow: '0 4px 10px rgba(255,51,102,0.35)'
          }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="notification-dropdown" style={{
          position: 'fixed', top: '68px', right: '12px',
          width: 'min(360px, calc(100vw - 24px))', maxWidth: '360px', background: 'var(--color-surface)',
          borderRadius: '16px', border: '1.5px solid var(--color-border)',
          boxShadow: '0 12px 40px rgba(108,71,255,0.18)',
          zIndex: 9000, overflow: 'hidden',
          animation: 'notifDrop 0.2s ease',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--color-page)'
          }}>
            <div style={{
              fontSize: '16px', fontWeight: '800', color: 'var(--color-text)'
            }}>Notifications</div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background: 'none', border: 'none',
                minHeight: '40px', padding: '6px 8px',
                fontSize: '13px', color: 'var(--color-brand)',
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
                color: 'var(--color-text-subtle)', fontSize: '13px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '10px'
                }}>
                  <BrandIcon name="notifications" size={54} />
                </div>
                No notifications yet
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={async () => {
                    markRead(notif.id)
                    setOpen(false)
                    setActionDone(null)

                    if (notif.type === 'message') {
                      await openMessageNotification(notif)
                      return
                    }

                    if (notif.type === 'wallet') {
                      onNavigate && onNavigate('wallet')
                      return
                    }

                    if (notif.type === 'commission') {
                      onNavigate && onNavigate('commission')
                      return
                    }

                    // Receipt and completion updates belong in the user's job
                    // workspace, where they can continue the receipt/review flow.
                    if (notif.type === 'receipt' || notif.type === 'review') {
                      onNavigate && onNavigate('mygigs')
                      return
                    }

                    // Job outcome notifications should open the actual gig in the
                    // app's current gig detail view, rather than the legacy sheet.
                    if (['accepted', 'rejected'].includes(notif.type) && notif.gig_id) {
                      onNavigate && onNavigate('feed')
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          window.dispatchEvent(new CustomEvent('openGigDetail', {
                            detail: notif.gig_id
                          }))
                        })
                      })
                      return
                    }

                    if (!notif.gig_id) {
                      setNotifDetail({ type: 'info', notif })
                      return
                    }

                    setLoadingDetail(true)

                    if (notif.type === 'application') {
                      const { data: gig } = await supabase
                        .from('gigs')
                        .select('*, users(full_name, avatar_url)')
                        .eq('id', notif.gig_id)
                        .single()

                      const { data: apps } = await supabase
                        .from('applications')
                        .select('*, users(id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location, phone)')
                        .eq('gig_id', notif.gig_id)
                        .order('created_at', { ascending: false })

                      setNotifDetail({ type: 'application', notif, gig_id: notif.gig_id, gig, applications: apps || [] })
                    } else if (notif.type === 'accepted' || notif.type === 'rejected') {
                      const { data: gig } = await supabase
                        .from('gigs')
                        .select('*, users(id, full_name, avatar_url, phone, trust_score, rating, location, bio, gigs_completed)')
                        .eq('id', notif.gig_id)
                        .single()

                      setNotifDetail({ type: notif.type, gig })
                    } else if (notif.type === 'receipt' || notif.type === 'review') {
                      const { data: gig } = await supabase
                        .from('gigs')
                        .select('*, users(id, full_name, avatar_url, phone, trust_score, rating, location, bio, gigs_completed)')
                        .eq('id', notif.gig_id)
                        .single()
                      setNotifDetail({ type: notif.type, gig, notif })
                    } else {
                      const { data: gig } = await supabase
                        .from('gigs')
                        .select('*, users(full_name, avatar_url, phone, trust_score)')
                        .eq('id', notif.gig_id)
                        .single()

                      setNotifDetail({ type: 'general', gig, notif })
                    }

                    setLoadingDetail(false)
                  }}
                  style={{
                    padding: '12px 16px',
                    background: notif.read ? 'var(--color-surface)' : 'var(--color-surface-tint)',
                    borderBottom: '1px solid var(--color-page)',
                    cursor: 'pointer', transition: 'background 0.1s',
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                  onMouseLeave={e => e.currentTarget.style.background = notif.read ? 'var(--color-surface)' : 'var(--color-surface-tint)'}
                >
                  <BrandIcon name={getIcon(notif.type)} size={42} active={!notif.read} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '15px', fontWeight: notif.read ? '500' : '700',
                      color: 'var(--color-text)', marginBottom: '2px',
                      lineHeight: '1.3'
                    }}>{notif.title}</div>
                    <div style={{
                      fontSize: '13px', color: 'var(--color-text-muted)',
                      lineHeight: '1.4', marginBottom: '3px'
                    }}>{notif.message}</div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: '500'
                    }}>{timeAgo(notif.created_at)}</div>
                  </div>
                  {!notif.read && (
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: 'var(--color-brand)', flexShrink: 0, marginTop: '4px'
                    }} />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: '10px 16px', borderTop: '1px solid var(--color-page)',
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
                  minHeight: '40px', padding: '6px 10px',
                  fontSize: '13px', color: 'var(--color-text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit'
                }}>Clear all notifications</button>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loadingDetail && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.5)',
          zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: '16px',
            padding: '24px 32px', textAlign: 'center',
            fontSize: '14px', color: 'var(--color-brand)', fontWeight: '700'
          }}>⏳ Loading...</div>
        </div>
      )}

      {/* Notification Detail Sheet */}
      {notifDetail && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }} onClick={() => { setNotifDetail(null); setActionDone(null) }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-surface)',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '88vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
            border: '1.5px solid var(--color-border)'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: 'var(--color-border)', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />

            {/* APPLICATION TYPE */}
            {notifDetail.type === 'application' && (
              <>
                {/* Gig context */}
                <div style={{
                  background: 'var(--color-page)', borderRadius: '12px',
                  padding: '12px 14px', marginBottom: '20px'
                }}>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                  }}>Gig</div>
                  <div style={{
                    fontSize: '15px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '4px'
                  }}>{notifDetail.gig?.title}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)',
                      borderRadius: '5px', padding: '2px 8px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-success)'
                    }}>
                      ${notifDetail.gig?.pay_min}–${notifDetail.gig?.pay_max}
                    </span>
                    <span style={{
                      background: 'var(--color-brand-soft)', border: '1px solid var(--color-brand-border-strong)',
                      borderRadius: '5px', padding: '2px 8px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-brand)'
                    }}>
                      {notifDetail.gig?.slots_filled || 0}/{notifDetail.gig?.slots} slots
                    </span>
                  </div>
                </div>

                <div style={{
                  fontSize: '13px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px'
                }}>
                  {notifDetail.applications.length} Applicant{notifDetail.applications.length !== 1 ? 's' : ''}
                </div>

                {notifDetail.applications.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '32px',
                    color: 'var(--color-text-subtle)', fontSize: '13px'
                  }}>No applications yet</div>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px'
                  }}>
                    {notifDetail.applications.map((app, i) => (
                      <div key={i} style={{
                        background: 'var(--color-page)', borderRadius: '16px',
                        padding: '16px', border: '1.5px solid var(--color-border)'
                      }}>
                        <div style={{
                          display: 'flex', gap: '12px',
                          alignItems: 'flex-start', marginBottom: '12px'
                        }}>
                          <div
                            onClick={() => setViewingProfile(app.users?.id)}
                            style={{
                              width: '52px', height: '52px', borderRadius: '14px',
                              background: 'var(--color-brand-soft)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: '20px', fontWeight: '800', color: 'var(--color-brand)',
                              overflow: 'hidden', flexShrink: 0,
                              cursor: 'pointer', border: '2px solid var(--color-brand-border-strong)'
                            }}>
                            {app.users?.avatar_url ? (
                              <img src={app.users.avatar_url} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              app.users?.full_name?.charAt(0) || '?'
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              onClick={() => setViewingProfile(app.users?.id)}
                              style={{
                                fontSize: '15px', fontWeight: '700',
                                color: 'var(--color-brand)', cursor: 'pointer',
                                marginBottom: '3px',
                                textDecoration: 'underline',
                                textDecorationStyle: 'dotted'
                              }}>
                              {app.users?.full_name || 'Unknown'} →
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                              ⭐ {app.users?.rating || 5.0} ·{' '}
                              {app.users?.gigs_completed || 0} gigs ·{' '}
                              Trust {app.users?.trust_score || 100}%
                            </div>
                            {app.users?.location && (
                              <div style={{ fontSize: '13px', color: 'var(--color-warning)' }}>
                                📍 {app.users.location}
                              </div>
                            )}
                          </div>
                          <div style={{
                            background: app.status === 'accepted' ? 'var(--color-success-soft)'
                              : app.status === 'rejected' ? 'var(--color-danger-soft)' : 'var(--color-brand-soft)',
                            border: `1px solid ${app.status === 'accepted' ? 'var(--color-success-border)'
                              : app.status === 'rejected' ? 'var(--color-danger-border)' : 'var(--color-brand-border-strong)'}`,
                            borderRadius: '7px', padding: '4px 10px',
                            fontSize: '12px', fontWeight: '700',
                            color: app.status === 'accepted' ? 'var(--color-success)'
                              : app.status === 'rejected' ? 'var(--color-danger)' : 'var(--color-brand)',
                            flexShrink: 0
                          }}>
                            {app.status === 'accepted' ? '✓ Accepted'
                              : app.status === 'rejected' ? '✗ Declined' : '⏳ Pending'}
                          </div>
                        </div>

                        {app.users?.skills && app.users.skills.length > 0 && (
                          <div style={{
                            display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px'
                          }}>
                            {app.users.skills.slice(0, 4).map(skill => (
                              <span key={skill} style={{
                                background: 'var(--color-brand-soft)', borderRadius: '20px',
                                padding: '3px 9px', fontSize: '12px',
                                fontWeight: '600', color: 'var(--color-brand)'
                              }}>{skill}</span>
                            ))}
                          </div>
                        )}

                        {app.users?.bio && (
                          <div style={{
                            fontSize: '12px', color: 'var(--color-text-muted)',
                            lineHeight: '1.5', marginBottom: '12px', fontStyle: 'italic'
                          }}>"{app.users.bio}"</div>
                        )}

                        {/* Message applicant button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            // Capture values immediately before any state changes
                            const targetUserId = app.worker_id
                            const gigId = notifDetail.gig?.id
                            // Close notification sheet completely first
                            setActionDone(null)
                            setNotifDetail(null)
                            setOpen(false)
                            // Wait for React to fully unmount the sheet, then fire event
                            requestAnimationFrame(() => {
                              requestAnimationFrame(() => {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openChatWithUser', {
                                    detail: { userId: targetUserId }
                                  }))
                                }, 100)
                              })
                            })
                          }}
                          style={{
                            width: '100%',
                            background: 'var(--color-page)',
                            border: '1.5px solid var(--color-brand-border-strong)',
                            borderRadius: '10px', padding: '10px',
                            fontSize: '12px', fontWeight: '700',
                            color: 'var(--color-brand)', cursor: 'pointer',
                            fontFamily: 'inherit', marginTop: '8px',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '6px'
                          }}>
                          💬 Message {app.users?.full_name?.split(' ')[0]}
                        </button>

                        {app.status === 'pending' && notifDetail.gig?.poster_id === user?.id && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={async () => {
                                const detail = notifDetail
                                let gig = detail?.gig
                                const gigId = gig?.id || detail?.gig_id || detail?.notif?.gig_id || app.gig_id
                                if (!gigId) {
                                  showToast('Could not find this gig. Please reopen the notification and try again.', 'error')
                                  return
                                }

                                if (!gig?.slots || !gig?.poster_id || !gig?.title) {
                                  const { data: latestGig } = await supabase
                                    .from('gigs')
                                    .select('id, title, slots, poster_id')
                                    .eq('id', gigId)
                                    .single()

                                  gig = latestGig || gig
                                }

                                const gigTitle = gig?.title || detail?.notif?.message?.match(/"([^"]+)"/)?.[1] || 'this gig'
                                const posterId = gig?.poster_id || user?.id

                                const acceptedAt = new Date().toISOString()

                                const { error: acceptError } = await supabase
                                  .from('applications')
                                  .update({
                                    status: 'accepted',
                                    accepted_at: acceptedAt
                                  })
                                  .eq('id', app.id)
                                if (acceptError) {
                                  showToast('Error accepting: ' + acceptError.message, 'error')
                                  return
                                }

                                const { data: acceptedApps } = await supabase
                                  .from('applications')
                                  .select('id')
                                  .eq('gig_id', gigId)
                                  .eq('status', 'accepted')

                                const filled = acceptedApps?.length || 1
                                const slots = Number(gig?.slots || 0)
                                const slotsFull = slots > 0 && filled >= slots

                                const { error: gigError } = await supabase
                                  .from('gigs')
                                  .update({
                                    status: slotsFull ? 'in_progress' : 'open',
                                    worker_id: app.worker_id,
                                    worker_name: app.users?.full_name,
                                    accepted_at: acceptedAt,
                                    slots_filled: filled
                                  })
                                  .eq('id', gigId)
                                if (gigError) {
                                  showToast('Error updating gig: ' + gigError.message, 'error')
                                  return
                                }

                                if (slotsFull) {
                                  await supabase
                                    .from('applications')
                                    .update({ status: 'declined' })
                                    .eq('gig_id', gigId)
                                    .neq('id', app.id)
                                    .eq('status', 'pending')
                                }

                                if (posterId) {
                                  await ensureGigConversation({
                                    gigId,
                                    posterId,
                                    workerId: app.worker_id
                                  })
                                }

                                const { error: notifError } = await supabase.from('notifications').insert({
                                  user_id: app.worker_id,
                                  title: 'You Got The Job!',
                                  message: `Your application for "${gigTitle}" was accepted! Contact the poster and get started.`,
                                  type: 'accepted',
                                  gig_id: gigId
                                })
                                if (notifError) {
                                  showToast('Accepted, but notification failed: ' + notifError.message)
                                }

                                const { data: apps } = await supabase
                                  .from('applications')
                                  .select('*, users(id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location, phone)')
                                  .eq('gig_id', gigId)
                                  .order('created_at', { ascending: false })

                                setNotifDetail(prev => ({ ...prev, applications: apps || [] }))
                                setActionDone('accepted')
                              }}
                              style={{
                                flex: 1, background: 'var(--color-success-soft)',
                                border: '1.5px solid var(--color-success-border)',
                                borderRadius: '10px', padding: '12px',
                                fontSize: '13px', fontWeight: '700',
                                color: 'var(--color-success)', cursor: 'pointer', fontFamily: 'inherit'
                              }}>✓ Accept</button>
                            <button
                              onClick={async () => {
                                const detail = notifDetail
                                const gig = detail?.gig
                                const gigId = gig?.id || detail?.gig_id || detail?.notif?.gig_id || app.gig_id
                                const gigTitle = gig?.title || detail?.notif?.message?.match(/"([^"]+)"/)?.[1] || 'this gig'
                                if (!gigId) {
                                  showToast('Could not find this gig. Please reopen the notification and try again.', 'error')
                                  return
                                }

                                await supabase
                                  .from('applications')
                                  .update({ status: 'declined', declined_at: new Date().toISOString() })
                                  .eq('id', app.id)

                                await supabase.from('notifications').insert({
                                  user_id: app.worker_id,
                                  title: 'Application Update',
                                  message: `Your application for "${gigTitle}" was not selected`,
                                  type: 'rejected',
                                  gig_id: gigId
                                })

                                const { data: apps } = await supabase
                                  .from('applications')
                                  .select('*, users(id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location, phone)')
                                  .eq('gig_id', gigId)
                                  .order('created_at', { ascending: false })

                                setNotifDetail(prev => ({ ...prev, applications: apps || [] }))
                                setActionDone('declined')
                              }}
                              style={{
                                flex: 1, background: 'var(--color-danger-soft)',
                                border: '1.5px solid var(--color-danger-border)',
                                borderRadius: '10px', padding: '12px',
                                fontSize: '13px', fontWeight: '700',
                                color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit'
                              }}>✗ Decline</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {actionDone && (
                  <div style={{
                    background: actionDone === 'accepted' ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                    border: `1.5px solid ${actionDone === 'accepted' ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                    borderRadius: '12px', padding: '12px 16px',
                    fontSize: '13px', fontWeight: '700',
                    color: actionDone === 'accepted' ? 'var(--color-success)' : 'var(--color-danger)',
                    textAlign: 'center', marginBottom: '16px'
                  }}>
                    {actionDone === 'accepted'
                      ? '✓ Application accepted! Worker has been notified.'
                      : '✗ Application declined. Worker has been notified.'}
                  </div>
                )}

                <button
                  onClick={() => { setNotifDetail(null); setOpen(false); onNavigate && onNavigate('mygigs') }}
                  style={{
                    width: '100%', padding: '13px', borderRadius: '14px',
                    background: 'var(--color-brand-gradient)',
                    color: 'var(--color-surface)', fontWeight: '800', fontSize: '14px',
                    border: 'none', cursor: 'pointer', marginTop: '4px'
                  }}
                >View in My Gigs →</button>
              </>
            )}

            {/* ACCEPTED / REJECTED TYPE — shown to worker */}
            {(notifDetail.type === 'accepted' || notifDetail.type === 'rejected') && (
              <div>
                {/* Status header */}
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                    {notifDetail.type === 'accepted' ? '🎉' : '😔'}
                  </div>
                  <div style={{
                    fontSize: '20px', fontWeight: '800',
                    color: notifDetail.type === 'accepted' ? 'var(--color-success)' : 'var(--color-danger)',
                    marginBottom: '8px'
                  }}>
                    {notifDetail.type === 'accepted'
                      ? 'You were accepted!'
                      : 'Not selected this time'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                    {notifDetail.type === 'accepted'
                      ? 'The client accepted your application. Contact them to confirm details.'
                      : 'Keep applying — the right gig is coming.'}
                  </div>
                </div>

                {/* Client Profile Card */}
                {notifDetail.gig?.users && (
                  <div style={{
                    background: 'linear-gradient(135deg, var(--color-brand-soft), var(--color-brand-pale))',
                    border: '1.5px solid var(--color-brand-border-strong)',
                    borderRadius: '16px', padding: '16px',
                    marginBottom: '14px'
                  }}>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '12px'
                    }}>Client Profile</div>

                    <div style={{
                      display: 'flex', gap: '12px',
                      alignItems: 'center', marginBottom: '14px'
                    }}>
                      <div
                        onClick={() => setViewingProfile(notifDetail.gig.poster_id)}
                        style={{
                          width: '56px', height: '56px', borderRadius: '14px',
                          background: 'var(--color-brand-soft)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '22px', fontWeight: '800', color: 'var(--color-brand)',
                          overflow: 'hidden', flexShrink: 0,
                          cursor: 'pointer', border: '2px solid var(--color-brand-border-strong)'
                        }}>
                        {notifDetail.gig.users.avatar_url ? (
                          <img
                            src={notifDetail.gig.users.avatar_url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          notifDetail.gig.users.full_name?.charAt(0) || '?'
                        )}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div
                          onClick={() => setViewingProfile(notifDetail.gig.poster_id)}
                          style={{
                            fontSize: '16px', fontWeight: '700',
                            color: 'var(--color-brand)', cursor: 'pointer',
                            marginBottom: '3px',
                            textDecoration: 'underline',
                            textDecorationStyle: 'dotted'
                          }}>
                          {notifDetail.gig.users.full_name || 'Client'} →
                        </div>
                        {notifDetail.gig.users.location && (
                          <div style={{ fontSize: '13px', color: 'var(--color-warning)', marginBottom: '3px' }}>
                            📍 {notifDetail.gig.users.location}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                          ⭐ {notifDetail.gig.users.rating || 5.0} ·{' '}
                          Trust {notifDetail.gig.users.trust_score || 100}%
                        </div>
                      </div>

                      <div style={{
                        background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                        borderRadius: '10px', padding: '8px 12px',
                        textAlign: 'center', flexShrink: 0
                      }}>
                        <div style={{
                          fontSize: '16px', fontWeight: '800', color: 'var(--color-brand)'
                        }}>
                          {notifDetail.gig.users.trust_score || 100}%
                        </div>
                        <div style={{
                          fontSize: '12px', color: 'var(--color-text-subtle)',
                          fontWeight: '600', letterSpacing: '0.5px'
                        }}>TRUST</div>
                      </div>
                    </div>

                    <button
                      onClick={() => setViewingProfile(notifDetail.gig.poster_id)}
                      style={{
                        width: '100%', background: 'var(--color-brand-soft)',
                        border: '1.5px solid var(--color-brand-border-strong)', borderRadius: '10px',
                        padding: '10px', fontSize: '12px', fontWeight: '700',
                        color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit'
                      }}>
                      👤 View Full Profile
                    </button>
                  </div>
                )}

                {/* Gig info */}
                {notifDetail.gig && (
                  <div style={{
                    background: 'var(--color-page)', borderRadius: '14px',
                    padding: '14px', border: '1.5px solid var(--color-border)',
                    marginBottom: '14px'
                  }}>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '8px'
                    }}>Gig Details</div>
                    <div style={{
                      fontSize: '15px', fontWeight: '700',
                      color: 'var(--color-text)', marginBottom: '6px'
                    }}>{notifDetail.gig.title}</div>
                    <div style={{
                      fontSize: '15px', fontWeight: '800', color: 'var(--color-success)',
                      marginBottom: '4px'
                    }}>
                      ${notifDetail.gig.pay_min}–${notifDetail.gig.pay_max}
                    </div>
                    {notifDetail.gig.location && (
                      <div style={{ fontSize: '12px', color: 'var(--color-warning)' }}>
                        📍 {notifDetail.gig.location}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* RECEIPT / REVIEW TYPE */}
            {(notifDetail.type === 'receipt' || notifDetail.type === 'review') && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                    {notifDetail.type === 'receipt' ? '🧾' : '⭐'}
                  </div>
                  <div style={{
                    fontSize: '17px', fontWeight: '800',
                    color: 'var(--color-text)', marginBottom: '8px', lineHeight: '1.3'
                  }}>{notifDetail.notif?.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                    {notifDetail.notif?.message}
                  </div>
                </div>
                {notifDetail.gig && (
                  <div style={{
                    background: 'var(--color-page)', borderRadius: '14px',
                    padding: '14px', border: '1.5px solid var(--color-border)', marginBottom: '20px'
                  }}>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px'
                    }}>Gig</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text)' }}>
                      {notifDetail.gig.title}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { setNotifDetail(null); setOpen(false); onNavigate && onNavigate('mygigs') }}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '14px',
                    background: 'var(--color-brand-gradient)',
                    color: 'var(--color-surface)', fontWeight: '800', fontSize: '15px',
                    border: 'none', cursor: 'pointer'
                  }}
                >View Receipt in My Gigs →</button>
              </div>
            )}

            {/* INFO TYPE — general notifications without gig_id */}
            {notifDetail.type === 'info' && (
              <div style={{ textAlign: 'center', padding: '16px 8px 28px' }}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '50%',
                  background: 'var(--color-page)', border: '3px solid var(--color-border)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '32px',
                  margin: '0 auto 20px'
                }}>🔔</div>
                <div style={{
                  fontSize: '20px', fontWeight: '800',
                  color: 'var(--color-text)', marginBottom: '12px', lineHeight: '1.3'
                }}>{notifDetail.notif?.title}</div>
                <div style={{
                  fontSize: '14px', color: 'var(--color-text-muted)',
                  lineHeight: '1.7'
                }}>{notifDetail.notif?.message}</div>
              </div>
            )}

            {/* GENERAL TYPE — misc notifications with a gig_id */}
            {notifDetail.type === 'general' && (
              notifDetail.gig ? (
                <div>
                  <div style={{
                    background: 'var(--color-page)', borderRadius: '14px',
                    padding: '14px', border: '1.5px solid var(--color-border)', marginBottom: '20px'
                  }}>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px'
                    }}>Related Gig</div>
                    <div style={{
                      fontSize: '15px', fontWeight: '700',
                      color: 'var(--color-text)', marginBottom: '6px'
                    }}>{notifDetail.gig.title}</div>
                    {notifDetail.gig.pay_min && (
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-success)' }}>
                        ${notifDetail.gig.pay_min}–${notifDetail.gig.pay_max}
                      </div>
                    )}
                    {notifDetail.gig.location && (
                      <div style={{ fontSize: '12px', color: 'var(--color-warning)', marginTop: '4px' }}>
                        📍 {notifDetail.gig.location}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setNotifDetail(null); setOpen(false); onNavigate && onNavigate('mygigs') }}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '14px',
                      background: 'var(--color-brand-gradient)',
                      color: 'var(--color-surface)', fontWeight: '800', fontSize: '15px',
                      border: 'none', cursor: 'pointer'
                    }}
                  >View in My Gigs →</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 8px 28px' }}>
                  <div style={{
                    width: '72px', height: '72px', borderRadius: '50%',
                    background: 'var(--color-page)', border: '3px solid var(--color-border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '32px',
                    margin: '0 auto 20px'
                  }}>🔔</div>
                  <div style={{
                    fontSize: '20px', fontWeight: '800',
                    color: 'var(--color-text)', marginBottom: '12px', lineHeight: '1.3'
                  }}>{notifDetail.notif?.title}</div>
                  <div style={{
                    fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.7'
                  }}>{notifDetail.notif?.message}</div>
                </div>
              )
            )}

            {/* Close */}
            <button
              onClick={() => { setNotifDetail(null); setActionDone(null) }}
              style={{
                width: '100%', background: 'var(--color-page)',
                border: '1.5px solid var(--color-border)', borderRadius: '12px',
                padding: '13px', fontSize: '13px', fontWeight: '600',
                color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit'
              }}>Close</button>
          </div>
        </div>
      )}

      {/* Public Profile from notification */}
      {viewingProfile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
          <PublicProfile
            userId={viewingProfile}
            onClose={() => setViewingProfile(null)}
          />
        </div>
      )}

      <style>{`
        @keyframes notifDrop {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bellring {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(15deg); }
          40% { transform: rotate(-15deg); }
          60% { transform: rotate(10deg); }
          80% { transform: rotate(-10deg); }
        }
      `}</style>
    </div>
  )
}
