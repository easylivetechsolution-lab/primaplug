import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import PublicProfile from './PublicProfile'

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
        <span style={{
          fontSize: '18px',
          display: 'inline-block',
          animation: unread > 0 ? 'bellring 1s ease infinite' : 'none'
        }}>🔔</span>
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
                  onClick={async () => {
                    markRead(notif.id)
                    setOpen(false)
                    setActionDone(null)

                    if (!notif.gig_id) return

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

                      setNotifDetail({ type: 'application', gig, applications: apps || [] })
                    } else if (notif.type === 'accepted' || notif.type === 'rejected') {
                      const { data: gig } = await supabase
                        .from('gigs')
                        .select('*, users(full_name, avatar_url, phone, trust_score)')
                        .eq('id', notif.gig_id)
                        .single()

                      setNotifDetail({ type: notif.type, gig })
                    } else {
                      const { data: gig } = await supabase
                        .from('gigs')
                        .select('*, users(full_name, avatar_url, phone, trust_score)')
                        .eq('id', notif.gig_id)
                        .single()

                      setNotifDetail({ type: 'general', gig })
                    }

                    setLoadingDetail(false)
                  }}
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

      {/* Loading */}
      {loadingDetail && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.5)',
          zIndex: 800, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px',
            padding: '24px 32px', textAlign: 'center',
            fontSize: '14px', color: '#6C47FF', fontWeight: '700'
          }}>⏳ Loading...</div>
        </div>
      )}

      {/* Notification Detail Sheet */}
      {notifDetail && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 800,
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }} onClick={() => { setNotifDetail(null); setActionDone(null) }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '88vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
            border: '1.5px solid #E2E0FF'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: '#E2E0FF', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />

            {/* APPLICATION TYPE */}
            {notifDetail.type === 'application' && (
              <>
                {/* Gig context */}
                <div style={{
                  background: '#F5F4FF', borderRadius: '12px',
                  padding: '12px 14px', marginBottom: '20px'
                }}>
                  <div style={{
                    fontSize: '10px', color: '#A09DC8', fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                  }}>Gig</div>
                  <div style={{
                    fontSize: '15px', fontWeight: '800', color: '#14123A', marginBottom: '4px'
                  }}>{notifDetail.gig?.title}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      background: '#DFFDF4', border: '1px solid #7EECD2',
                      borderRadius: '5px', padding: '2px 8px',
                      fontSize: '9px', fontWeight: '700', color: '#00C48C'
                    }}>
                      ${notifDetail.gig?.pay_min}–${notifDetail.gig?.pay_max}
                    </span>
                    <span style={{
                      background: '#EEE9FF', border: '1px solid #B8A5FF',
                      borderRadius: '5px', padding: '2px 8px',
                      fontSize: '9px', fontWeight: '700', color: '#6C47FF'
                    }}>
                      {notifDetail.gig?.slots_filled || 0}/{notifDetail.gig?.slots} slots
                    </span>
                  </div>
                </div>

                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px'
                }}>
                  {notifDetail.applications.length} Applicant{notifDetail.applications.length !== 1 ? 's' : ''}
                </div>

                {notifDetail.applications.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '32px',
                    color: '#A09DC8', fontSize: '13px'
                  }}>No applications yet</div>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px'
                  }}>
                    {notifDetail.applications.map((app, i) => (
                      <div key={i} style={{
                        background: '#F5F4FF', borderRadius: '16px',
                        padding: '16px', border: '1.5px solid #E2E0FF'
                      }}>
                        <div style={{
                          display: 'flex', gap: '12px',
                          alignItems: 'flex-start', marginBottom: '12px'
                        }}>
                          <div
                            onClick={() => setViewingProfile(app.users?.id)}
                            style={{
                              width: '52px', height: '52px', borderRadius: '14px',
                              background: '#EEE9FF', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: '20px', fontWeight: '800', color: '#6C47FF',
                              overflow: 'hidden', flexShrink: 0,
                              cursor: 'pointer', border: '2px solid #B8A5FF'
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
                                color: '#6C47FF', cursor: 'pointer',
                                marginBottom: '3px',
                                textDecoration: 'underline',
                                textDecorationStyle: 'dotted'
                              }}>
                              {app.users?.full_name || 'Unknown'} →
                            </div>
                            <div style={{ fontSize: '11px', color: '#8B8FAF', marginBottom: '4px' }}>
                              ⭐ {app.users?.rating || 5.0} ·{' '}
                              {app.users?.gigs_completed || 0} gigs ·{' '}
                              Trust {app.users?.trust_score || 100}%
                            </div>
                            {app.users?.location && (
                              <div style={{ fontSize: '11px', color: '#FF6B2B' }}>
                                📍 {app.users.location}
                              </div>
                            )}
                          </div>
                          <div style={{
                            background: app.status === 'accepted' ? '#DFFDF4'
                              : app.status === 'rejected' ? '#FFE8EE' : '#EEE9FF',
                            border: `1px solid ${app.status === 'accepted' ? '#7EECD2'
                              : app.status === 'rejected' ? '#FF99B3' : '#B8A5FF'}`,
                            borderRadius: '7px', padding: '4px 10px',
                            fontSize: '10px', fontWeight: '700',
                            color: app.status === 'accepted' ? '#00C48C'
                              : app.status === 'rejected' ? '#FF3366' : '#6C47FF',
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
                                background: '#EEE9FF', borderRadius: '20px',
                                padding: '3px 9px', fontSize: '10px',
                                fontWeight: '600', color: '#6C47FF'
                              }}>{skill}</span>
                            ))}
                          </div>
                        )}

                        {app.users?.bio && (
                          <div style={{
                            fontSize: '12px', color: '#8B8FAF',
                            lineHeight: '1.5', marginBottom: '12px', fontStyle: 'italic'
                          }}>"{app.users.bio}"</div>
                        )}

                        {app.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={async () => {
                                await supabase
                                  .from('applications')
                                  .update({ status: 'accepted' })
                                  .eq('id', app.id)

                                const { data: accepted } = await supabase
                                  .from('applications')
                                  .select('id')
                                  .eq('gig_id', notifDetail.gig.id)
                                  .eq('status', 'accepted')

                                const filled = (accepted?.length || 0) + 1

                                if (filled >= notifDetail.gig.slots) {
                                  await supabase
                                    .from('gigs')
                                    .update({ status: 'in_progress', slots_filled: filled })
                                    .eq('id', notifDetail.gig.id)
                                } else {
                                  await supabase
                                    .from('gigs')
                                    .update({ slots_filled: filled })
                                    .eq('id', notifDetail.gig.id)
                                }

                                await supabase.from('notifications').insert({
                                  user_id: app.worker_id,
                                  title: 'Application Accepted! 🎉',
                                  message: `Your application for "${notifDetail.gig.title}" was accepted`,
                                  type: 'accepted',
                                  gig_id: notifDetail.gig.id
                                })

                                const { data: apps } = await supabase
                                  .from('applications')
                                  .select('*, users(id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location, phone)')
                                  .eq('gig_id', notifDetail.gig.id)
                                  .order('created_at', { ascending: false })

                                setNotifDetail(prev => ({ ...prev, applications: apps || [] }))
                                setActionDone('accepted')
                              }}
                              style={{
                                flex: 1, background: '#DFFDF4',
                                border: '1.5px solid #7EECD2',
                                borderRadius: '10px', padding: '12px',
                                fontSize: '13px', fontWeight: '700',
                                color: '#00C48C', cursor: 'pointer', fontFamily: 'inherit'
                              }}>✓ Accept</button>
                            <button
                              onClick={async () => {
                                await supabase
                                  .from('applications')
                                  .update({ status: 'rejected' })
                                  .eq('id', app.id)

                                await supabase.from('notifications').insert({
                                  user_id: app.worker_id,
                                  title: 'Application Update',
                                  message: `Your application for "${notifDetail.gig.title}" was not selected`,
                                  type: 'rejected',
                                  gig_id: notifDetail.gig.id
                                })

                                const { data: apps } = await supabase
                                  .from('applications')
                                  .select('*, users(id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location, phone)')
                                  .eq('gig_id', notifDetail.gig.id)
                                  .order('created_at', { ascending: false })

                                setNotifDetail(prev => ({ ...prev, applications: apps || [] }))
                                setActionDone('declined')
                              }}
                              style={{
                                flex: 1, background: '#FFE8EE',
                                border: '1.5px solid #FF99B3',
                                borderRadius: '10px', padding: '12px',
                                fontSize: '13px', fontWeight: '700',
                                color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
                              }}>✗ Decline</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {actionDone && (
                  <div style={{
                    background: actionDone === 'accepted' ? '#DFFDF4' : '#FFE8EE',
                    border: `1.5px solid ${actionDone === 'accepted' ? '#7EECD2' : '#FF99B3'}`,
                    borderRadius: '12px', padding: '12px 16px',
                    fontSize: '13px', fontWeight: '700',
                    color: actionDone === 'accepted' ? '#00C48C' : '#FF3366',
                    textAlign: 'center', marginBottom: '16px'
                  }}>
                    {actionDone === 'accepted'
                      ? '✓ Application accepted! Worker has been notified.'
                      : '✗ Application declined. Worker has been notified.'}
                  </div>
                )}
              </>
            )}

            {/* ACCEPTED / REJECTED TYPE — shown to worker */}
            {(notifDetail.type === 'accepted' || notifDetail.type === 'rejected') && (
              <div>
                <div style={{
                  textAlign: 'center', padding: '20px 0', marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                    {notifDetail.type === 'accepted' ? '🎉' : '😔'}
                  </div>
                  <div style={{
                    fontSize: '20px', fontWeight: '800',
                    color: notifDetail.type === 'accepted' ? '#00C48C' : '#FF3366',
                    marginBottom: '8px'
                  }}>
                    {notifDetail.type === 'accepted' ? 'You were accepted!' : 'Not selected this time'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#8B8FAF', lineHeight: '1.6' }}>
                    {notifDetail.type === 'accepted'
                      ? 'The client accepted your application. Contact them to confirm details.'
                      : 'Keep applying — the right gig is coming.'}
                  </div>
                </div>

                {notifDetail.gig && (
                  <div style={{
                    background: '#F5F4FF', borderRadius: '14px',
                    padding: '16px', border: '1.5px solid #E2E0FF', marginBottom: '16px'
                  }}>
                    <div style={{
                      fontSize: '15px', fontWeight: '700', color: '#14123A', marginBottom: '8px'
                    }}>{notifDetail.gig.title}</div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#00C48C' }}>
                      ${notifDetail.gig.pay_min}–${notifDetail.gig.pay_max}
                    </div>
                    {notifDetail.gig.location && (
                      <div style={{ fontSize: '12px', color: '#FF6B2B', marginTop: '4px' }}>
                        📍 {notifDetail.gig.location}
                      </div>
                    )}
                  </div>
                )}

                {notifDetail.type === 'accepted' && notifDetail.gig?.users?.phone && (
                  <a
                    href={`https://wa.me/${notifDetail.gig.users.phone.replace(/\D/g,'')}?text=Hi, my application for "${notifDetail.gig.title}" on Prima was accepted. Looking forward to working with you!`}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      background: '#25D366', borderRadius: '12px',
                      padding: '14px', fontSize: '14px',
                      fontWeight: '700', color: '#fff',
                      textDecoration: 'none', marginBottom: '10px'
                    }}>
                    💬 Message Client on WhatsApp
                  </a>
                )}
              </div>
            )}

            {/* Close */}
            <button
              onClick={() => { setNotifDetail(null); setActionDone(null) }}
              style={{
                width: '100%', background: '#F5F4FF',
                border: '1.5px solid #E2E0FF', borderRadius: '12px',
                padding: '13px', fontSize: '13px', fontWeight: '600',
                color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
              }}>Close</button>
          </div>
        </div>
      )}

      {/* Public Profile from notification */}
      {viewingProfile && (
        <div style={{ position: 'relative', zIndex: 900 }}>
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