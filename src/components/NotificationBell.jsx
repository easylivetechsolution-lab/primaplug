import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function NotificationBell({ onNavigate }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [selectedGig, setSelectedGig] = useState(null)
  const [loadingGig, setLoadingGig] = useState(false)
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

                    if (notif.gig_id) {
                      setLoadingGig(true)
                      const { data } = await supabase
                        .from('gigs')
                        .select('*, users(full_name, avatar_url, trust_score, rating, gigs_completed, phone, location)')
                        .eq('id', notif.gig_id)
                        .single()
                      if (data) setSelectedGig(data)
                      setLoadingGig(false)
                    }
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

      {/* Gig Detail from Notification */}
      {selectedGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 800,
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }} onClick={() => setSelectedGig(null)}>
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

            {/* Notification context */}
            <div style={{
              background: '#EEE9FF', borderRadius: '10px',
              padding: '10px 14px', marginBottom: '16px',
              fontSize: '12px', color: '#6C47FF', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <span>🔔</span>
              <span>From your notifications</span>
            </div>

            {/* Poster */}
            <div style={{
              display: 'flex', gap: '12px',
              alignItems: 'center', marginBottom: '16px'
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '13px',
                background: '#EEE9FF', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: '800',
                color: '#6C47FF', overflow: 'hidden', flexShrink: 0
              }}>
                {selectedGig.users?.avatar_url ? (
                  <img src={selectedGig.users.avatar_url} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  selectedGig.users?.full_name?.charAt(0) || '?'
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px', fontWeight: '700', color: '#14123A'
                }}>
                  {selectedGig.users?.full_name || 'Anonymous'}
                </div>
                <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                  ⭐ {selectedGig.users?.rating || 5.0} ·{' '}
                  Trust {selectedGig.users?.trust_score || 100}%
                </div>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: '#FFE8EE', border: '1px solid #FF99B3',
                borderRadius: '6px', padding: '4px 10px',
                fontSize: '10px', fontWeight: '800', color: '#FF3366'
              }}>
                {selectedGig.urgency?.toUpperCase()}
              </div>
            </div>

            {/* Title */}
            <h2 style={{
              fontSize: '20px', fontWeight: '800',
              color: '#14123A', marginBottom: '16px', lineHeight: '1.3'
            }}>{selectedGig.title}</h2>

            {/* Badges */}
            <div style={{
              display: 'flex', gap: '7px',
              flexWrap: 'wrap', marginBottom: '16px'
            }}>
              <span style={{
                background: selectedGig.type === 'physical' ? '#FFF0E8' : '#EEE9FF',
                border: `1px solid ${selectedGig.type === 'physical' ? '#FFBC99' : '#B8A5FF'}`,
                borderRadius: '6px', padding: '4px 10px',
                fontSize: '10px', fontWeight: '700',
                color: selectedGig.type === 'physical' ? '#FF6B2B' : '#6C47FF'
              }}>
                {selectedGig.type === 'physical' ? '📌 PHYSICAL' : '💻 DIGITAL'}
              </span>
              {selectedGig.field && (
                <span style={{
                  background: '#F5F4FF', border: '1px solid #E2E0FF',
                  borderRadius: '6px', padding: '4px 10px',
                  fontSize: '10px', fontWeight: '600', color: '#8B8FAF'
                }}>{selectedGig.field}</span>
              )}
              {selectedGig.slots > 1 && (
                <span style={{
                  background: '#DFFDF4', border: '1px solid #7EECD2',
                  borderRadius: '6px', padding: '4px 10px',
                  fontSize: '10px', fontWeight: '700', color: '#00C48C'
                }}>
                  {selectedGig.slots_filled || 0}/{selectedGig.slots} slots filled
                </span>
              )}
            </div>

            {/* Pay + Location */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '10px', marginBottom: '14px'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #E8FFE4, #DFFDF4)',
                border: '1.5px solid #7EECD2',
                borderRadius: '14px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '9px', color: '#00C48C', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Pay Range</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800',
                  color: '#00C48C', letterSpacing: '-0.5px'
                }}>${selectedGig.pay_min}</div>
                <div style={{ fontSize: '11px', color: '#00C48C', opacity: 0.7 }}>
                  up to ${selectedGig.pay_max}
                </div>
              </div>
              <div style={{
                background: '#FFF0E8', border: '1.5px solid #FFBC99',
                borderRadius: '14px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '9px', color: '#FF6B2B', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Location</div>
                <div style={{
                  fontSize: '13px', fontWeight: '700',
                  color: '#14123A', lineHeight: '1.3'
                }}>{selectedGig.location || 'Remote'}</div>
              </div>
            </div>

            {/* Phone */}
            {selectedGig.users?.phone && (
              <div style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '12px', padding: '12px 14px',
                marginBottom: '12px',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '16px' }}>📱</span>
                  <div>
                    <div style={{
                      fontSize: '10px', color: '#A09DC8', fontWeight: '600',
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px'
                    }}>Phone / WhatsApp</div>
                    <div style={{
                      fontSize: '14px', fontWeight: '700', color: '#14123A'
                    }}>{selectedGig.users.phone}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={`tel:${selectedGig.users.phone}`} style={{
                    background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                    borderRadius: '9px', padding: '8px 12px',
                    fontSize: '12px', fontWeight: '700',
                    color: '#6C47FF', textDecoration: 'none'
                  }}>📞 Call</a>
                  <a href={`https://wa.me/${selectedGig.users.phone.replace(/\D/g,'')}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      background: '#25D366', borderRadius: '9px',
                      padding: '8px 12px', fontSize: '12px',
                      fontWeight: '700', color: '#fff', textDecoration: 'none'
                    }}>💬 WhatsApp</a>
                </div>
              </div>
            )}

            {/* Description */}
            {selectedGig.description && (
              <div style={{
                background: '#F5F4FF', borderRadius: '12px',
                padding: '14px', marginBottom: '14px',
                fontSize: '13px', color: '#5B5887', lineHeight: '1.6'
              }}>{selectedGig.description}</div>
            )}

            {/* Exact address */}
            {(selectedGig.house_number || selectedGig.street || selectedGig.landmark) && (
              <div style={{
                background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                borderRadius: '12px', padding: '14px', marginBottom: '14px'
              }}>
                <div style={{
                  fontSize: '10px', color: '#6C47FF', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px'
                }}>🔒 Exact Address</div>
                {selectedGig.house_number && (
                  <div style={{ fontSize: '12px', color: '#14123A', marginBottom: '4px' }}>
                    🏠 {selectedGig.house_number}
                  </div>
                )}
                {selectedGig.street && (
                  <div style={{ fontSize: '12px', color: '#14123A', marginBottom: '4px' }}>
                    🛣 {selectedGig.street}
                  </div>
                )}
                {selectedGig.landmark && (
                  <div style={{ fontSize: '12px', color: '#14123A', marginBottom: '4px' }}>
                    🏛 Near {selectedGig.landmark}
                  </div>
                )}
                {selectedGig.directions && (
                  <div style={{ fontSize: '11px', color: '#8B8FAF', marginTop: '6px', lineHeight: '1.5' }}>
                    📋 {selectedGig.directions}
                  </div>
                )}
                {selectedGig.latitude && selectedGig.longitude && (
                  <a href={`https://www.google.com/maps?q=${selectedGig.latitude},${selectedGig.longitude}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      marginTop: '12px', background: '#fff',
                      border: '1.5px solid #B8A5FF', borderRadius: '10px',
                      padding: '10px', fontSize: '13px', fontWeight: '700',
                      color: '#6C47FF', textDecoration: 'none'
                    }}>
                    🗺 Open in Google Maps
                  </a>
                )}
              </div>
            )}

            {/* Close button */}
            <button onClick={() => setSelectedGig(null)} style={{
              width: '100%', background: '#F5F4FF',
              border: '1.5px solid #E2E0FF', borderRadius: '12px',
              padding: '14px', fontSize: '13px', fontWeight: '600',
              color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
            }}>Close</button>
          </div>
        </div>
      )}

      {loadingGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.5)',
          zIndex: 800, display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px',
            padding: '24px 32px', textAlign: 'center',
            fontSize: '14px', color: '#6C47FF', fontWeight: '700'
          }}>⏳ Loading gig...</div>
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