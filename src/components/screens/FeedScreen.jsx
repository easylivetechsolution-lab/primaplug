import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import { CATEGORIES, ALL_FIELDS } from '../../data/categories'
import { getProfileCompletion } from '../../utils/profileComplete'
import ProfilePrompt from '../ProfilePrompt'
import { useAuth } from '../../context/AuthContext'

const URGENCY = {
  now: { label: 'NOW', color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' },
  today: { label: 'TODAY', color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99' },
  scheduled: { label: 'SCHEDULED', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  flexible: { label: 'FLEXIBLE', color: '#A09DC8', bg: '#F5F4FF', border: '#E2E0FF' },
}

export default function FeedScreen() {
  const { profile } = useAuth()
  const [gigs, setGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [urgFilter, setUrgFilter] = useState('all')
  const [fieldFilter, setFieldFilter] = useState('All')
  const [showFieldGroup, setShowFieldGroup] = useState(null)
  const [selectedGig, setSelectedGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)

  useEffect(() => {
    fetchGigs()
    const channel = supabase
      .channel('feed-channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'gigs'
      }, () => fetchGigs())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const fetchGigs = async () => {
    const { data, error } = await supabase
      .from('gigs')
      .select(`
        *,
        users (
          full_name,
          username,
          avatar_url,
          trust_score,
          rating,
          gigs_completed,
          location
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) {
      console.log('Feed error:', error.message)
    } else {
      setGigs(data || [])
    }
    setLoading(false)
  }

  const filtered = gigs.filter(g => {
    if (typeFilter !== 'all' && g.type !== typeFilter) return false
    if (urgFilter !== 'all' && g.urgency !== urgFilter) return false
    if (fieldFilter !== 'All' && g.field !== fieldFilter) return false
    return true
  })

  const chipStyle = (active, color = '#6C47FF', bg = '#EEE9FF', border = '#B8A5FF') => ({
    background: active ? bg : 'transparent',
    border: `1.5px solid ${active ? border : '#E2E0FF'}`,
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '600',
    color: active ? color : '#8B8FAF',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    transition: 'all 0.15s'
  })

  const UrgencyBadge = ({ urgency }) => {
    const u = URGENCY[urgency] || URGENCY.flexible
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: u.bg, border: `1px solid ${u.border}`,
        borderRadius: '5px', padding: '2px 8px',
        fontSize: '9px', fontWeight: '800',
        color: u.color, letterSpacing: '0.8px'
      }}>
        {urgency === 'now' && (
          <span style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: u.color, display: 'inline-block',
            animation: 'blink 0.9s infinite'
          }} />
        )}
        {u.label}
      </span>
    )
  }

  return (
    <div style={{
      padding: '20px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>

      {/* AI Match Strip */}
      <div style={{
        background: 'linear-gradient(135deg, #EEE9FF, #F8F5FF)',
        border: '1.5px solid #B8A5FF',
        borderRadius: '16px', padding: '16px', marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: '7px', marginBottom: '12px'
        }}>
          <BrandIcon name="discover" size={30} />
          <span style={{
            fontSize: '11px', fontWeight: '700', color: '#6C47FF',
            letterSpacing: '0.8px', textTransform: 'uppercase'
          }}>AI Matched For You</span>
        </div>
        {loading ? (
          <div style={{ fontSize: '13px', color: '#A09DC8' }}>
            Finding your best matches...
          </div>
        ) : gigs.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#A09DC8' }}>
            No gigs yet — be the first to post one! 🚀
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: '10px',
            overflowX: 'auto', paddingBottom: '4px',
            scrollbarWidth: 'none'
          }}>
            {gigs.slice(0, 3).map(gig => (
              <div key={gig.id} onClick={() => setSelectedGig(gig)}
                style={{
                  background: '#fff', borderRadius: '12px',
                  padding: '12px 14px', minWidth: '180px',
                  border: '1.5px solid #E2E0FF',
                  cursor: 'pointer', flexShrink: 0
                }}>
                <UrgencyBadge urgency={gig.urgency} />
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: '#14123A', margin: '7px 0 5px',
                  lineHeight: '1.3'
                }}>{gig.title}</div>
                <div style={{
                  fontSize: '14px', fontWeight: '800', color: '#00C48C'
                }}>${gig.pay_min}+</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Type Filters */}
      <div style={{
        display: 'flex', gap: '8px', overflowX: 'auto',
        marginBottom: '10px', scrollbarWidth: 'none', paddingBottom: '4px'
      }}>
        {['all', 'physical', 'digital'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={chipStyle(
              typeFilter === t,
              t === 'digital' ? '#6C47FF' : '#FF6B2B',
              t === 'digital' ? '#EEE9FF' : '#FFF0E8',
              t === 'digital' ? '#B8A5FF' : '#FFBC99'
            )}>
            {t === 'all' ? '✦ All' : t === 'physical' ? '📌 Physical' : '💻 Digital'}
          </button>
        ))}
      </div>

      {/* Urgency Filters */}
      <div style={{
        display: 'flex', gap: '8px', overflowX: 'auto',
        marginBottom: '10px', scrollbarWidth: 'none', paddingBottom: '4px'
      }}>
        {['all', 'now', 'today', 'scheduled', 'flexible'].map(u => (
          <button key={u} onClick={() => setUrgFilter(u)}
            style={chipStyle(
              urgFilter === u,
              u === 'all' ? '#6C47FF' : URGENCY[u]?.color,
              u === 'all' ? '#EEE9FF' : URGENCY[u]?.bg,
              u === 'all' ? '#B8A5FF' : URGENCY[u]?.border
            )}>
            {u === 'all' ? 'All' : URGENCY[u]?.label}
          </button>
        ))}
      </div>

      {/* Field Filters — grouped */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex', gap: '8px',
          overflowX: 'auto', paddingBottom: '8px',
          scrollbarWidth: 'none'
        }}>
          {/* All button */}
          <button
            onClick={() => setFieldFilter('All')}
            style={chipStyle(fieldFilter === 'All')}>
            ✦ All Fields
          </button>

          {/* Category group buttons */}
          {CATEGORIES.map(cat => (
            <button
              key={cat.group}
              onClick={() => setShowFieldGroup(
                showFieldGroup === cat.group ? null : cat.group
              )}
              style={{
                background: showFieldGroup === cat.group ||
                  cat.fields.includes(fieldFilter) ? cat.bg : 'transparent',
                border: `1.5px solid ${showFieldGroup === cat.group ||
                  cat.fields.includes(fieldFilter) ? cat.border : '#E2E0FF'}`,
                borderRadius: '20px', padding: '6px 13px',
                fontSize: '12px', fontWeight: '600',
                color: showFieldGroup === cat.group ||
                  cat.fields.includes(fieldFilter) ? cat.color : '#8B8FAF',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'inherit', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}>
              <span>{cat.icon}</span>
              <span>{cat.group}</span>
              {cat.fields.includes(fieldFilter) && (
                <span style={{
                  background: cat.color, color: '#fff',
                  borderRadius: '50%', width: '14px', height: '14px',
                  fontSize: '8px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontWeight: '800'
                }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Sub-fields dropdown */}
        {showFieldGroup && (
          <div style={{
            background: '#fff', border: '1.5px solid #E2E0FF',
            borderRadius: '14px', padding: '12px 14px',
            marginTop: '8px', animation: 'fadeIn 0.2s ease'
          }}>
            {(() => {
              const cat = CATEGORIES.find(c => c.group === showFieldGroup)
              if (!cat) return null
              return (
                <>
                  <div style={{
                    fontSize: '10px', fontWeight: '700', color: cat.color,
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    marginBottom: '10px', display: 'flex',
                    alignItems: 'center', gap: '6px'
                  }}>
                    <span>{cat.icon}</span>
                    <span>{cat.group}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                    {cat.fields.map(field => (
                      <button
                        key={field}
                        onClick={() => {
                          setFieldFilter(field)
                          setShowFieldGroup(null)
                        }}
                        style={{
                          background: fieldFilter === field ? cat.bg : '#F5F4FF',
                          border: `1.5px solid ${fieldFilter === field ? cat.border : '#E2E0FF'}`,
                          borderRadius: '20px', padding: '6px 12px',
                          fontSize: '12px', fontWeight: '600',
                          color: fieldFilter === field ? cat.color : '#8B8FAF',
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.15s'
                        }}>
                        {field}
                      </button>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* Active filter display */}
        {fieldFilter !== 'All' && (
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: '8px', marginTop: '8px'
          }}>
            <span style={{ fontSize: '11px', color: '#8B8FAF' }}>
              Filtered by:
            </span>
            <span style={{
              background: '#EEE9FF', border: '1.5px solid #B8A5FF',
              borderRadius: '20px', padding: '4px 12px',
              fontSize: '12px', fontWeight: '600', color: '#6C47FF',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              {fieldFilter}
              <span
                onClick={() => setFieldFilter('All')}
                style={{ cursor: 'pointer', fontSize: '14px', color: '#A09DC8' }}>
                ×
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Gig Count */}
      {!loading && (
        <div style={{
          fontSize: '11px', color: '#A09DC8', fontWeight: '600',
          letterSpacing: '0.5px', marginBottom: '12px'
        }}>
          {filtered.length} GIG{filtered.length !== 1 ? 'S' : ''} AVAILABLE
        </div>
      )}

      {/* Gig List */}
      {loading ? (
        <div style={{
          textAlign: 'center', padding: '48px 0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <BrandIcon name="feed" size={46} />
          </div>
          <div style={{ fontSize: '14px', color: '#A09DC8', fontWeight: '600' }}>Loading gigs...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          background: '#fff', borderRadius: '16px',
          border: '1.5px solid #E2E0FF'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <BrandIcon name="search" size={46} />
          </div>
          <div style={{
            fontSize: '15px', fontWeight: '700',
            color: '#14123A', marginBottom: '6px'
          }}>No gigs found</div>
          <div style={{ fontSize: '13px', color: '#A09DC8' }}>
            Try changing your filters or post a new gig
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(gig => (
            <div key={gig.id} onClick={() => setSelectedGig(gig)}
              style={{
                background: '#fff', border: '1.5px solid #E2E0FF',
                borderRadius: '16px', padding: '18px',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#B8A5FF'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(108,71,255,0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E2E0FF'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}>

              {/* Top Row */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', marginBottom: '12px'
              }}>
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <div style={{
                    display: 'flex', gap: '5px',
                    flexWrap: 'wrap', marginBottom: '7px'
                  }}>
                    <UrgencyBadge urgency={gig.urgency} />
                    <span style={{
                      background: gig.type === 'physical' ? '#FFF0E8' : '#EEE9FF',
                      border: `1px solid ${gig.type === 'physical' ? '#FFBC99' : '#B8A5FF'}`,
                      borderRadius: '5px', padding: '2px 8px',
                      fontSize: '9px', fontWeight: '700',
                      color: gig.type === 'physical' ? '#FF6B2B' : '#6C47FF',
                      letterSpacing: '0.5px'
                    }}>
                      {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                    </span>
                    {gig.slots > 1 && (
                      <span style={{
                        background: '#DFFDF4', border: '1px solid #7EECD2',
                        borderRadius: '5px', padding: '2px 8px',
                        fontSize: '9px', fontWeight: '700', color: '#00C48C'
                      }}>{gig.slots} SLOTS</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '15px', fontWeight: '700',
                    color: '#14123A', lineHeight: '1.35'
                  }}>{gig.title}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: '19px', fontWeight: '800',
                    color: '#00C48C', letterSpacing: '-0.5px'
                  }}>${gig.pay_min}</div>
                  <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                    –${gig.pay_max}
                  </div>
                </div>
              </div>

              {/* Bottom Row */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{
                  display: 'flex', gap: '9px', alignItems: 'center'
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '9px',
                    background: '#EEE9FF', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: '800', color: '#6C47FF',
                    overflow: 'hidden', flexShrink: 0
                  }}>
                    {gig.users?.avatar_url ? (
                      <img src={gig.users.avatar_url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      gig.users?.full_name?.charAt(0) || '?'
                    )}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px', fontWeight: '600', color: '#14123A'
                    }}>
                      {gig.users?.full_name || 'Anonymous'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                      ⭐ {gig.users?.rating || 5.0} · {gig.users?.gigs_completed || 0} gigs
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {gig.location && (
                    <div style={{
                      fontSize: '10px', color: '#FF6B2B', marginBottom: '1px'
                    }}>📍 {gig.location}</div>
                  )}
                  <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                    {new Date(gig.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GIG DETAIL SHEET */}
      {selectedGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 300,
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center'
        }} onClick={() => {
          setSelectedGig(null)
          setApplied(false)
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '88vh',
            overflowY: 'auto',
            border: '1.5px solid #E2E0FF',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: '#E2E0FF', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />

            {applied ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: '52px', marginBottom: '12px' }}>🎯</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800',
                  color: '#6C47FF', marginBottom: '8px'
                }}>Application Sent!</div>
                <div style={{
                  fontSize: '13px', color: '#8B8FAF', lineHeight: '1.6'
                }}>
                  The client has been notified. They will review and confirm your application.
                </div>
              </div>
            ) : (
              <>
                {/* Badges */}
                <div style={{
                  display: 'flex', gap: '6px',
                  flexWrap: 'wrap', marginBottom: '12px'
                }}>
                  <UrgencyBadge urgency={selectedGig.urgency} />
                  <span style={{
                    background: selectedGig.type === 'physical' ? '#FFF0E8' : '#EEE9FF',
                    border: `1px solid ${selectedGig.type === 'physical' ? '#FFBC99' : '#B8A5FF'}`,
                    borderRadius: '6px', padding: '3px 9px',
                    fontSize: '9px', fontWeight: '700',
                    color: selectedGig.type === 'physical' ? '#FF6B2B' : '#6C47FF'
                  }}>
                    {selectedGig.type === 'physical' ? '📌 PHYSICAL' : '💻 DIGITAL'}
                  </span>
                  {selectedGig.slots > 1 && (
                    <span style={{
                      background: '#DFFDF4', border: '1px solid #7EECD2',
                      borderRadius: '6px', padding: '3px 9px',
                      fontSize: '9px', fontWeight: '700', color: '#00C48C'
                    }}>{selectedGig.slots} OPEN SLOTS</span>
                  )}
                </div>

                {/* Title */}
                <h2 style={{
                  fontSize: '20px', fontWeight: '800',
                  color: '#14123A', lineHeight: '1.3', marginBottom: '16px'
                }}>{selectedGig.title}</h2>

                {/* Poster Info */}
                <div style={{
                  background: '#F5F4FF', borderRadius: '14px',
                  padding: '14px', marginBottom: '14px',
                  display: 'flex', gap: '12px', alignItems: 'center'
                }}>
                  <div
                    onClick={() => setViewingProfile(selectedGig.poster_id)}
                    style={{
                        width: '46px', height: '46px', borderRadius: '12px',
                        background: '#EEE9FF', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', fontWeight: '800', color: '#6C47FF',
                        overflow: 'hidden', flexShrink: 0, cursor: 'pointer'
                    }}>
                    {selectedGig.users?.avatar_url ? (
                        <img src={selectedGig.users.avatar_url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        selectedGig.users?.full_name?.charAt(0) || '?'
                    )}
                    </div>
                  <div style={{ flex: 1 }}>
                    <div
                    onClick={() => setViewingProfile(selectedGig.poster_id)}
                    style={{
                    fontSize: '14px', fontWeight: '700',
                    color: '#6C47FF', marginBottom: '2px',
                    cursor: 'pointer', textDecoration: 'underline',
                    textDecorationStyle: 'dotted'
                    }}>
                    {selectedGig.users?.full_name || 'Anonymous'} →
                    </div>
                    <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                      ⭐ {selectedGig.users?.rating || 5.0} rating ·{' '}
                      {selectedGig.users?.gigs_completed || 0} gigs completed
                    </div>
                  </div>
                  <div style={{
                    background: '#EEE9FF', borderRadius: '10px',
                    padding: '8px 12px', textAlign: 'center'
                  }}>
                    <div style={{
                      fontSize: '14px', fontWeight: '800', color: '#6C47FF'
                    }}>
                      {selectedGig.users?.trust_score || 100}%
                    </div>
                    <div style={{
                      fontSize: '8px', color: '#A09DC8',
                      fontWeight: '600', letterSpacing: '0.5px'
                    }}>TRUST</div>
                  </div>
                </div>

                {/* Pay + Location */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '10px', marginBottom: '14px'
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #E8FFE4, #DFFDF4)',
                    border: '1.5px solid #7EECD2',
                    borderRadius: '14px', padding: '16px'
                  }}>
                    <div style={{
                      fontSize: '9px', color: '#00C48C',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      fontWeight: '700', marginBottom: '4px'
                    }}>Pay Range</div>
                    <div style={{
                      fontSize: '24px', fontWeight: '800',
                      color: '#00C48C', letterSpacing: '-0.5px'
                    }}>${selectedGig.pay_min}</div>
                    <div style={{ fontSize: '11px', color: '#00C48C', opacity: 0.7 }}>
                      up to ${selectedGig.pay_max}
                    </div>
                  </div>
                  <div style={{
                    background: '#FFF0E8', border: '1.5px solid #FFBC99',
                    borderRadius: '14px', padding: '16px'
                  }}>
                    <div style={{
                      fontSize: '9px', color: '#FF6B2B',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      fontWeight: '700', marginBottom: '4px'
                    }}>Location</div>
                    <div style={{
                      fontSize: '14px', fontWeight: '700',
                      color: '#14123A', lineHeight: '1.3'
                    }}>
                      {selectedGig.location || 'Remote'}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedGig.description && (
                  <div style={{
                    background: '#F5F4FF', borderRadius: '12px',
                    padding: '14px', marginBottom: '14px',
                    fontSize: '13px', color: '#5B5887', lineHeight: '1.6'
                  }}>
                    {selectedGig.description}
                  </div>
                )}

                {/* Protection */}
                <div style={{
                  background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                  borderRadius: '12px', padding: '14px',
                  display: 'flex', gap: '10px', marginBottom: '20px'
                }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>🔒</span>
                  <div style={{
                    fontSize: '12px', color: '#6C47FF', lineHeight: '1.6'
                  }}>
                    Both parties confirm completion by uploading receipts with their names. No payment platform needed — direct and protected.
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Message button */}
                  <button
                    onClick={() => {
                      setSelectedGig(null)
                      window.dispatchEvent(new CustomEvent('openChatWithUser', {
                        detail: {
                          userId: selectedGig.poster_id,
                          gigId: selectedGig.id
                        }
                      }))
                    }}
                    style={{
                      width: '100%',
                      background: '#F5F4FF',
                      border: '1.5px solid #B8A5FF',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700',
                      color: '#6C47FF', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#EEE9FF' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#F5F4FF' }}>
                    <span>💬</span> Message Client
                  </button>

                  {/* Skip + Apply row */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => {
                    setSelectedGig(null)
                    setApplied(false)
                  }} style={{
                    flex: 1, background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '600',
                    color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
                  }}>Skip</button>
                  <button
                    onClick={async () => {
  const { complete } = getProfileCompletion(profile)
  if (!complete) {
    setShowProfilePrompt(true)
    return
  }
  setApplying(true)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) {
      alert('Please log in to apply')
      setApplying(false)
      return
    }
    // Check if already applied
    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('gig_id', selectedGig.id)
      .eq('worker_id', userId)
      .maybeSingle()
    if (existing) {
      alert('You already applied for this gig!')
      setApplying(false)
      return
    }
    // Save application
    const { error } = await supabase
      .from('applications')
      .insert({
        gig_id: selectedGig.id,
        worker_id: userId,
        status: 'pending'
      })
    if (error) {
      alert('Error applying: ' + error.message)
      setApplying(false)
      return
    }
    // Notify the gig poster
    await supabase.from('notifications').insert({
      user_id: selectedGig.poster_id,
      title: 'New Application!',
      message: `Someone applied for your gig "${selectedGig.title}"`,
      type: 'application',
      gig_id: selectedGig.id
    })
    // Create conversation between applicant and poster
    const { data: existingConvo } = await supabase
      .from('conversations')
      .select('id')
      .eq('gig_id', selectedGig.id)
      .eq('participant_1', selectedGig.poster_id)
      .eq('participant_2', userId)
      .maybeSingle()

    if (!existingConvo) {
      await supabase.from('conversations').insert({
        gig_id: selectedGig.id,
        participant_1: selectedGig.poster_id,
        participant_2: userId,
        last_message: 'Application sent',
        last_message_at: new Date().toISOString()
      })
    }
    setApplied(true)
  } catch (e) {
    console.log('Apply error:', e)
  }
  setApplying(false)
}}
                    disabled={applying}
                    style={{
                      flex: 2,
                      background: applying
                        ? '#B8A5FF'
                        : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                      border: 'none', borderRadius: '12px',
                      padding: '14px', fontSize: '14px',
                      fontWeight: '700', color: '#fff',
                      cursor: applying ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
                      fontFamily: 'inherit', transition: 'all 0.2s'
                    }}>
                    {applying ? '⏳ Applying...' : '⚡ Apply for This Gig'}
                  </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Public Profile Sheet */}
      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      {showProfilePrompt && (
        <ProfilePrompt
          profile={profile}
          onClose={() => setShowProfilePrompt(false)}
          onGoToProfile={() => {
            setShowProfilePrompt(false)
            setSelectedGig(null)
            window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
          }}
        />
      )}
    </div>
  )
}
