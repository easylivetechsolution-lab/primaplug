import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { parseTimestamp } from '../../utils/time'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import EmptyState from '../EmptyState'
import { showToast } from '../../utils/toast'
import ScreenLoader from '../ScreenLoader'
import { CATEGORIES, ALL_FIELDS } from '../../data/categories'
import CategoryIcon from '../CategoryIcon'
import { getCurrency } from '../../data/currencies'
import { getProfileCompletion } from '../../utils/profileComplete'
import ProfilePrompt from '../ProfilePrompt'
import { useAuth } from '../../context/AuthContext'
import ShareGig from '../ShareGig'
import ReportModal from '../ReportModal'
import { applyToGig } from '../../utils/gigApplications'

const URGENCY = {
  now: { label: 'NOW', color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', border: 'var(--color-danger-border)' },
  today: { label: 'TODAY', color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', border: 'var(--color-warning-border)' },
  scheduled: { label: 'SCHEDULED', color: 'var(--color-brand)', bg: 'var(--color-brand-soft)', border: 'var(--color-brand-border-strong)' },
  flexible: { label: 'FLEXIBLE', color: 'var(--color-text-subtle)', bg: 'var(--color-page)', border: 'var(--color-border)' },
}

const getCurrencySymbol = (code) => getCurrency(code || 'USD').symbol

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - parseTimestamp(d)) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

const timeUntil = (d) => {
  const diff = parseTimestamp(d) - Date.now()
  if (diff <= 0) return null
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  return days === 1 ? '1 day' : `${days} days`
}

const ExpiryBadge = ({ expiresAt, small = false }) => {
  if (!expiresAt) return null
  const remaining = timeUntil(expiresAt)
  if (!remaining) return null
  const isUrgent = parseTimestamp(expiresAt) - Date.now() < 24 * 60 * 60 * 1000
  const isWarning = parseTimestamp(expiresAt) - Date.now() < 3 * 24 * 60 * 60 * 1000
  const color = isUrgent ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-text-subtle)'
  const bg = isUrgent ? 'var(--color-danger-soft)' : isWarning ? 'var(--color-warning-soft)' : 'var(--color-page)'
  const border = isUrgent ? 'var(--color-danger-border)' : isWarning ? 'var(--color-warning-border)' : 'var(--color-border)'
  return (
    <span style={{
      fontSize: small ? '9px' : '11px', fontWeight: '700', color,
      background: bg, border: `1px solid ${border}`,
      borderRadius: small ? '4px' : '6px',
      padding: small ? '1px 5px' : '2px 8px',
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      whiteSpace: 'nowrap',
    }}>
      {remaining} left
    </span>
  )
}

export default function FeedScreen() {
  const { profile, user } = useAuth()
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
  const [savedGigIds, setSavedGigIds] = useState(new Set())
  const [saveNotice, setSaveNotice] = useState('')
  const [sharingGig, setSharingGig] = useState(null)
  const [reportingGig, setReportingGig] = useState(null)

  const handleGigClick = (gig) => {
    if (gig.latitude && gig.longitude) {
      window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'map' }))
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('openGigOnMap', { detail: gig }))
      }, 350)
    } else {
      setSelectedGig(gig)
    }
  }

  useEffect(() => {
    fetchGigs()
    fetchSavedIds()
    const channel = supabase
      .channel('feed-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gigs' }, () => fetchGigs())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gigs' }, () => fetchGigs())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'gigs' }, () => fetchGigs())
      .subscribe()
    const expireInterval = setInterval(fetchGigs, 60000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(expireInterval)
    }
  }, [])

  useEffect(() => {
  const handleOpenGigDetail = async (e) => {
    const gigId = e.detail
    if (!gigId) return
    const { data } = await supabase
      .from('gigs')
      .select(`*, poster:users!gigs_poster_id_fkey (full_name, username, avatar_url, trust_score, rating, gigs_completed, location, phone)`)
      .eq('id', gigId)
      .maybeSingle()
    if (data) {
      window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'feed' }))
      setSelectedGig(data)
    }
  }
  window.addEventListener('openGigDetail', handleOpenGigDetail)
  return () => window.removeEventListener('openGigDetail', handleOpenGigDetail)
}, [])

  const fetchGigs = async () => {
    const { data, error } = await supabase
      .from('gigs')
      .select(`
        *,
        poster:users!gigs_poster_id_fkey (
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
      .is('deleted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.log('Feed error:', error.message)
    } else {
      setGigs((data || []).filter(gig =>
        !gig.expires_at || parseTimestamp(gig.expires_at) >= new Date()
      ))
    }
    setLoading(false)
  }

  const fetchSavedIds = async () => {
    if (!user) return
    const { data } = await supabase
      .from('saved_gigs')
      .select('gig_id')
      .eq('user_id', user.id)
    if (data) setSavedGigIds(new Set(data.map(s => s.gig_id)))
  }

  const toggleSave = async (e, gigId) => {
    e.stopPropagation()
    if (!user) return
    if (savedGigIds.has(gigId)) {
      await supabase
        .from('saved_gigs')
        .delete()
        .eq('user_id', user.id)
        .eq('gig_id', gigId)
      setSavedGigIds(prev => {
        const next = new Set(prev)
        next.delete(gigId)
        return next
      })
      setSaveNotice('Gig removed')
    } else {
      await supabase
        .from('saved_gigs')
        .insert({ user_id: user.id, gig_id: gigId })
      setSavedGigIds(prev => new Set([...prev, gigId]))
      setSaveNotice('Gig saved')
    }
    setTimeout(() => setSaveNotice(''), 1800)
  }

  const filtered = gigs.filter(g => {
    if (typeFilter !== 'all' && g.type !== typeFilter) return false
    if (urgFilter !== 'all' && g.urgency !== urgFilter) return false
    if (fieldFilter !== 'All' && g.field !== fieldFilter) return false
    return true
  })

  const handleApplySelectedGig = async () => {
    if (applying) return
    setApplying(true)
    try {
      if (!user?.id) {
        showToast('Please log in to apply', 'error')
        return
      }

      const { data: userProfile } = await supabase
        .from('users')
        .select('selfie_verified')
        .eq('id', user.id)
        .single()

      if (!userProfile?.selfie_verified) {
        showToast('Please complete selfie verification in your profile before applying for gigs.', 'error')
        window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
        return
      }

      const { complete } = getProfileCompletion(profile)
      if (!complete) {
        setShowProfilePrompt(true)
        return
      }

      const result = await applyToGig({
        gig: selectedGig,
        workerId: user.id
      })

      if (result.blocked) {
        showToast(result.message, 'error')
        const lower = result.message?.toLowerCase() || ''
        if (lower.includes('commission') || lower.includes('restricted')) {
          window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))
        }
        return
      }

      if (result.alreadyApplied) {
        showToast('You already applied for this gig!')
        return
      }

      setApplied(true)
    } catch (e) {
      console.log('Apply error:', e)
      showToast('Error applying: ' + e.message, 'error')
    } finally {
      setApplying(false)
    }
  }

  const chipStyle = (active, color = 'var(--color-brand)', bg = 'var(--color-brand-soft)', border = 'var(--color-brand-border-strong)') => ({
    background: active ? bg : 'transparent',
    border: `1.5px solid ${active ? border : 'var(--color-border)'}`,
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '600',
    color: active ? color : 'var(--color-text-muted)',
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
        fontSize: '12px', fontWeight: '800',
        color: u.color, letterSpacing: '0.8px'
      }}>
        {u.label}
      </span>
    )
  }

  return (
    <div className="feed-screen" style={{
      padding: '20px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>

      {/* AI Match Strip */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-brand-soft), var(--color-brand-pale))',
        border: '1.5px solid var(--color-brand-border-strong)',
        borderRadius: '16px', padding: '16px', marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: '7px', marginBottom: '12px'
        }}>
          <BrandIcon name="discover" size={30} />
          <span style={{
            fontSize: '13px', fontWeight: '700', color: 'var(--color-brand)',
            letterSpacing: '0.8px', textTransform: 'uppercase'
          }}>AI Matched For You</span>
        </div>
        {loading ? (
          <ScreenLoader />
        ) : gigs.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>
            No gigs yet — be the first to post one! 🚀
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: '10px',
            overflowX: 'auto', paddingBottom: '4px',
            scrollbarWidth: 'none'
          }}>
            {gigs.slice(0, 3).map(gig => (
              <div key={gig.id} onClick={() => handleGigClick(gig)}
                style={{
                  background: 'var(--color-surface)', borderRadius: '12px',
                  padding: '12px 14px', minWidth: '180px',
                  border: '1.5px solid var(--color-border)',
                  cursor: 'pointer', flexShrink: 0
                }}>
                <UrgencyBadge urgency={gig.urgency} />
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-text)', margin: '7px 0 5px',
                  lineHeight: '1.3'
                }}>{gig.title}</div>
                <div style={{
                  fontSize: '14px', fontWeight: '800', color: 'var(--color-success)'
                }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}+</div>
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
              t === 'digital' ? 'var(--color-brand)' : 'var(--color-warning)',
              t === 'digital' ? 'var(--color-brand-soft)' : 'var(--color-warning-soft)',
              t === 'digital' ? 'var(--color-brand-border-strong)' : 'var(--color-warning-border)'
            )}>
            {t === 'all'
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><BrandIcon name="feed" size={18} active={false} />All</span>
              : t === 'physical' ? '📌 Physical' : '💻 Digital'}
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
              u === 'all' ? 'var(--color-brand)' : URGENCY[u]?.color,
              u === 'all' ? 'var(--color-brand-soft)' : URGENCY[u]?.bg,
              u === 'all' ? 'var(--color-brand-border-strong)' : URGENCY[u]?.border
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><BrandIcon name="discover" size={18} active={false} />All Fields</span>
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
                  cat.fields.includes(fieldFilter) ? cat.border : 'var(--color-border)'}`,
                borderRadius: '20px', padding: '6px 13px',
                fontSize: '12px', fontWeight: '600',
                color: showFieldGroup === cat.group ||
                  cat.fields.includes(fieldFilter) ? cat.color : 'var(--color-text-muted)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'inherit', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}>
              <CategoryIcon category={cat.group} size={16} color={cat.color} />
              <span>{cat.group}</span>
              {cat.fields.includes(fieldFilter) && (
                <span style={{
                  background: cat.color, color: 'var(--color-surface)',
                  borderRadius: '50%', width: '14px', height: '14px',
                  fontSize: '12px', display: 'flex',
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
            background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
            borderRadius: '14px', padding: '12px 14px',
            marginTop: '8px', animation: 'fadeIn 0.2s ease'
          }}>
            {(() => {
              const cat = CATEGORIES.find(c => c.group === showFieldGroup)
              if (!cat) return null
              return (
                <>
                  <div style={{
                    fontSize: '12px', fontWeight: '700', color: cat.color,
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    marginBottom: '10px', display: 'flex',
                    alignItems: 'center', gap: '6px'
                  }}>
                    <CategoryIcon category={cat.group} size={16} color={cat.color} />
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
                          background: fieldFilter === field ? cat.bg : 'var(--color-page)',
                          border: `1.5px solid ${fieldFilter === field ? cat.border : 'var(--color-border)'}`,
                          borderRadius: '20px', padding: '6px 12px',
                          fontSize: '12px', fontWeight: '600',
                          color: fieldFilter === field ? cat.color : 'var(--color-text-muted)',
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
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Filtered by:
            </span>
            <span style={{
              background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
              borderRadius: '20px', padding: '4px 12px',
              fontSize: '12px', fontWeight: '600', color: 'var(--color-brand)',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              {fieldFilter}
              <span
                onClick={() => setFieldFilter('All')}
                style={{ cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-subtle)' }}>
                ×
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Gig Count */}
      {!loading && (
        <div style={{
          fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: '600',
          letterSpacing: '0.5px', marginBottom: '12px'
        }}>
          {filtered.length} GIG{filtered.length !== 1 ? 'S' : ''} AVAILABLE
        </div>
      )}

      {/* Gig List */}
      {loading ? (
        <ScreenLoader />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          compact
          title="No gigs found"
          message="Try changing your filters or post a new gig."
          actionLabel="Clear filters"
          onAction={() => {
            setTypeFilter('all')
            setUrgFilter('all')
            setFieldFilter('All')
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(gig => (
            <div key={gig.id} onClick={() => handleGigClick(gig)}
              style={{
                background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                borderRadius: '16px', padding: '18px',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(108,71,255,0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
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
                      background: gig.type === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)',
                      border: `1px solid ${gig.type === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)'}`,
                      borderRadius: '5px', padding: '2px 8px',
                      fontSize: '12px', fontWeight: '700',
                      color: gig.type === 'physical' ? 'var(--color-warning)' : 'var(--color-brand)',
                      letterSpacing: '0.5px'
                    }}>
                      {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                    </span>
                    {gig.slots > 1 && (
                      <span style={{
                        background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)',
                        borderRadius: '5px', padding: '2px 8px',
                        fontSize: '12px', fontWeight: '700', color: 'var(--color-success)'
                      }}>{gig.slots} SLOTS</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '15px', fontWeight: '700',
                    color: 'var(--color-text)', lineHeight: '1.35'
                  }}>{gig.title}</div>
                </div>
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-end', gap: '6px', flexShrink: 0
                }}>
                  <div style={{
                    fontSize: '19px', fontWeight: '800',
                    color: 'var(--color-success)', letterSpacing: '-0.5px'
                  }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    –{getCurrencySymbol(gig.currency)}{gig.pay_max}
                  </div>
                  <button
                    onClick={(e) => toggleSave(e, gig.id)}
                    style={{
                      background: savedGigIds.has(gig.id) ? 'var(--color-brand-soft)' : 'transparent',
                      border: `1.5px solid ${savedGigIds.has(gig.id) ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                      borderRadius: '8px', padding: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.15s', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    <BrandIcon
                      name={savedGigIds.has(gig.id) ? 'saved' : 'unsaved'}
                      size={24}
                      active={savedGigIds.has(gig.id)}
                    />
                  </button>
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
                    background: 'var(--color-brand-soft)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: '800', color: 'var(--color-brand)',
                    overflow: 'hidden', flexShrink: 0
                  }}>
                    {gig.poster?.avatar_url ? (
                      <img src={gig.poster.avatar_url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      gig.poster?.full_name?.charAt(0) || '?'
                    )}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '12px', fontWeight: '600', color: 'var(--color-text)'
                    }}>
                      {gig.poster?.full_name || 'Anonymous'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                      ⭐ {gig.poster?.rating || 5.0} · {gig.poster?.gigs_completed || 0} gigs
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                  {gig.location && (
                    <div style={{ fontSize: '12px', color: 'var(--color-warning)' }}>
                      📍 {gig.location}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    {timeAgo(gig.created_at)}
                  </div>
                  <ExpiryBadge expiresAt={gig.expires_at} small />
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
            background: 'var(--color-surface)',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '88vh',
            overflowY: 'auto',
            border: '1.5px solid var(--color-border)',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: 'var(--color-border)', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />

            {applied ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: '52px', marginBottom: '12px' }}>🎯</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800',
                  color: 'var(--color-brand)', marginBottom: '8px'
                }}>Application Sent!</div>
                <div style={{
                  fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6'
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
                    background: selectedGig.type === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)',
                    border: `1px solid ${selectedGig.type === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)'}`,
                    borderRadius: '6px', padding: '3px 9px',
                    fontSize: '12px', fontWeight: '700',
                    color: selectedGig.type === 'physical' ? 'var(--color-warning)' : 'var(--color-brand)'
                  }}>
                    {selectedGig.type === 'physical' ? '📌 PHYSICAL' : '💻 DIGITAL'}
                  </span>
                  {selectedGig.slots > 1 && (
                    <span style={{
                      background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)',
                      borderRadius: '6px', padding: '3px 9px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-success)'
                    }}>{selectedGig.slots} OPEN SLOTS</span>
                  )}
                </div>

                {/* Timing row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  flexWrap: 'wrap', marginBottom: '12px'
                }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>
                    Posted {timeAgo(selectedGig.created_at)}
                  </span>
                  {selectedGig.expires_at ? (
                    <ExpiryBadge expiresAt={selectedGig.expires_at} />
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>· Open-ended</span>
                  )}
                </div>

                {/* Title */}
                <h2 style={{
                  fontSize: '20px', fontWeight: '800',
                  color: 'var(--color-text)', lineHeight: '1.3', marginBottom: '16px'
                }}>{selectedGig.title}</h2>

                {/* Poster Info */}
                <div style={{
                  background: 'var(--color-page)', borderRadius: '14px',
                  padding: '14px', marginBottom: '14px',
                  display: 'flex', gap: '12px', alignItems: 'center'
                }}>
                  <div
                    onClick={() => setViewingProfile(selectedGig.poster_id)}
                    style={{
                        width: '46px', height: '46px', borderRadius: '12px',
                        background: 'var(--color-brand-soft)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', fontWeight: '800', color: 'var(--color-brand)',
                        overflow: 'hidden', flexShrink: 0, cursor: 'pointer'
                    }}>
                    {selectedGig.poster?.avatar_url ? (
                        <img src={selectedGig.poster.avatar_url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        selectedGig.poster?.full_name?.charAt(0) || '?'
                    )}
                    </div>
                  <div style={{ flex: 1 }}>
                    <div
                    onClick={() => setViewingProfile(selectedGig.poster_id)}
                    style={{
                    fontSize: '14px', fontWeight: '700',
                    color: 'var(--color-brand)', marginBottom: '2px',
                    cursor: 'pointer', textDecoration: 'underline',
                    textDecorationStyle: 'dotted'
                    }}>
                    {selectedGig.poster?.full_name || 'Anonymous'} →
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      ⭐ {selectedGig.poster?.rating || 5.0} rating ·{' '}
                      {selectedGig.poster?.gigs_completed || 0} gigs completed
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--color-brand-soft)', borderRadius: '10px',
                    padding: '8px 12px', textAlign: 'center'
                  }}>
                    <div style={{
                      fontSize: '14px', fontWeight: '800', color: 'var(--color-brand)'
                    }}>
                      {selectedGig.poster?.trust_score || 100}%
                    </div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-subtle)',
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
                    background: 'linear-gradient(135deg, var(--color-success-tint), var(--color-success-soft))',
                    border: '1.5px solid var(--color-success-border)',
                    borderRadius: '14px', padding: '16px'
                  }}>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-success)',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      fontWeight: '700', marginBottom: '4px'
                    }}>Pay Range</div>
                    <div style={{
                      fontSize: '24px', fontWeight: '800',
                      color: 'var(--color-success)', letterSpacing: '-0.5px'
                    }}>{getCurrencySymbol(selectedGig.currency)}{selectedGig.pay_min}</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-success)', opacity: 0.7 }}>
                      up to {getCurrencySymbol(selectedGig.currency)}{selectedGig.pay_max}
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)',
                    borderRadius: '14px', padding: '16px'
                  }}>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-warning)',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      fontWeight: '700', marginBottom: '4px'
                    }}>Location</div>
                    <div style={{
                      fontSize: '14px', fontWeight: '700',
                      color: 'var(--color-text)', lineHeight: '1.3'
                    }}>
                      {selectedGig.location || 'Remote'}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedGig.description && (
                  <div style={{
                    background: 'var(--color-page)', borderRadius: '12px',
                    padding: '14px', marginBottom: '14px',
                    fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6'
                  }}>
                    {selectedGig.description}
                  </div>
                )}

                {/* Protection */}
                {selectedGig.payment_method === 'wallet' ? (
  <div style={{
    background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
    borderRadius: '12px', padding: '14px',
    display: 'flex', gap: '10px', marginBottom: '20px'
  }}>
    <span style={{ fontSize: '16px', flexShrink: 0 }}>💰</span>
    <div style={{
      fontSize: '12px', color: 'var(--color-success)', lineHeight: '1.6'
    }}>
      Payment is already secured in escrow. You'll receive it automatically once the work is confirmed complete — no chasing payment needed.
    </div>
  </div>
) : (
  <div style={{
    background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
    borderRadius: '12px', padding: '14px',
    display: 'flex', gap: '10px', marginBottom: '20px'
  }}>
    <span style={{ fontSize: '16px', flexShrink: 0 }}>🔒</span>
    <div style={{
      fontSize: '12px', color: 'var(--color-brand)', lineHeight: '1.6'
    }}>
      Both parties confirm completion by uploading receipts with their names. No payment platform needed — direct and protected.
    </div>
  </div>
)}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Message button */}
                  <button
                    onClick={() => {
                      setSelectedGig(null)
                      window.dispatchEvent(new CustomEvent('openChatWithUser', {
                        detail: { userId: selectedGig.poster_id }
                      }))
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--color-page)',
                      border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700',
                      color: 'var(--color-brand)', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-soft)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-page)' }}>
                    <BrandIcon name="compose" size={22} /> Message Client
                  </button>

                  {/* Share & Earn */}
                  <button
                    onClick={() => setSharingGig(selectedGig)}
                    style={{
                      width: '100%',
                      background: 'var(--color-page)',
                      border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700',
                      color: 'var(--color-brand)', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-soft)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-page)' }}>
                    <span>🔗</span> Share & Earn Credits
                  </button>

                  {/* Report button */}
                  <button
                    onClick={() => setReportingGig(selectedGig)}
                    style={{
                      width: '100%',
                      background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                      borderRadius: '12px', padding: '10px',
                      fontSize: '12px', fontWeight: '700',
                      color: 'var(--color-danger)', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px'
                    }}>
                    🚨 Report This Gig
                  </button>

                  {/* Skip + Save + Apply row */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={(e) => toggleSave(e, selectedGig.id)}
                    style={{
                      background: savedGigIds.has(selectedGig?.id) ? 'var(--color-brand-soft)' : 'var(--color-page)',
                      border: `1.5px solid ${savedGigIds.has(selectedGig?.id) ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                      borderRadius: '12px', padding: '10px 13px',
                      cursor: 'pointer', flexShrink: 0,
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    <BrandIcon
                      name={savedGigIds.has(selectedGig?.id) ? 'saved' : 'unsaved'}
                      size={28}
                      active={savedGigIds.has(selectedGig?.id)}
                    />
                  </button>
                  <button onClick={() => {
                    setSelectedGig(null)
                    setApplied(false)
                  }} style={{
                    flex: 1, background: 'var(--color-page)',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '600',
                    color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit'
                  }}>Skip</button>
                  {selectedGig.poster_id === user?.id ? (
                    <div style={{
                      flex: 2, background: 'var(--color-page)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: '12px', padding: '14px',
                      fontSize: '13px', fontWeight: '600',
                      color: 'var(--color-text-subtle)', textAlign: 'center',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>Your gig</div>
                  ) : (
                  <button
                    onClick={handleApplySelectedGig}
                    disabled={applying}
                    style={{
                      flex: 2,
                      background: applying
                        ? 'var(--color-brand-border-strong)'
                        : 'var(--color-brand-gradient)',
                      border: 'none', borderRadius: '12px',
                      padding: '14px', fontSize: '14px',
                      fontWeight: '700', color: 'var(--color-surface)',
                      cursor: applying ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
                      fontFamily: 'inherit', transition: 'all 0.2s'
                    }}>
                    {applying ? '⏳ Applying...' : '⚡ Apply for This Gig'}
                  </button>
                  )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {saveNotice && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: '92px',
          transform: 'translateX(-50%)',
          zIndex: 12000,
          background: 'var(--color-text)',
          color: 'var(--color-surface)',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '13px',
          fontWeight: '700',
          boxShadow: '0 10px 28px rgba(20,18,58,0.28)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <BrandIcon name={saveNotice === 'Gig saved' ? 'saved' : 'unsaved'} size={22} />
          {saveNotice}
        </div>
      )}

      <style>{`
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

      {sharingGig && (
        <ShareGig gig={sharingGig} onClose={() => setSharingGig(null)} />
      )}

      {reportingGig && (
        <ReportModal
          reportedUserId={reportingGig.poster_id}
          reportedGigId={reportingGig.id}
          type="gig"
          name={`"${reportingGig.title}"`}
          onClose={() => setReportingGig(null)}
        />
      )}
    </div>
  )
}
