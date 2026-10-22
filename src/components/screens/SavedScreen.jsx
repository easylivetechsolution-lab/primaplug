import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import { showToast } from '../../utils/toast'
import EmptyState from '../EmptyState'
import ScreenLoader from '../ScreenLoader'
import { getCurrency } from '../../data/currencies'
import ShareGig from '../ShareGig'
import { parseTimestamp } from '../../utils/time'
import { getProfileCompletion } from '../../utils/profileComplete'
import ProfilePrompt from '../ProfilePrompt'
import { applyToGig } from '../../utils/gigApplications'

const getCurrencySymbol = (code) => getCurrency(code || 'USD').symbol

export default function SavedScreen() {
  const { user, profile } = useAuth()
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const [savedGigs, setSavedGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGig, setSelectedGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(null)
  const [sharingGig, setSharingGig] = useState(null)
  const [saveNotice, setSaveNotice] = useState('')

  useEffect(() => {
    fetchSavedGigs()
  }, [user])

  const fetchSavedGigs = async () => {
    if (!user) return
    const { data } = await supabase
      .from('saved_gigs')
      .select(`
        *,
        gigs (
          *,
          poster:users!gigs_poster_id_fkey (
            id, full_name, avatar_url,
            trust_score, rating, gigs_completed, location
          )
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setSavedGigs(data.filter(s => s.gigs))
    setLoading(false)
  }

  const unsaveGig = async (gigId) => {
    await supabase
      .from('saved_gigs')
      .delete()
      .eq('user_id', user.id)
      .eq('gig_id', gigId)
    setSavedGigs(prev => prev.filter(s => s.gig_id !== gigId))
    if (selectedGig?.id === gigId) setSelectedGig(null)
    setSaveNotice('Gig removed')
    setTimeout(() => setSaveNotice(''), 1800)
  }

  const handleApply = async (gig) => {
    if (applying) return
    setApplying(true)

    // Selfie verification check
    const { data: userProfile } = await supabase
      .from('users')
      .select('selfie_verified')
      .eq('id', user.id)
      .single()
    if (!userProfile?.selfie_verified) {
      showToast('Please complete selfie verification in your profile before applying for gigs.', 'error')
      window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
      setApplying(false)
      return
    }
    // Profile completion check
    const { complete } = getProfileCompletion(profile)
    if (!complete) {
      setShowProfilePrompt(true)
      setApplying(false)
      return
    }
    try {
      const result = await applyToGig({
        gig,
        workerId: user.id
      })

      if (result.blocked) {
        showToast(result.message, 'error')
        const lower = result.message?.toLowerCase() || ''
        if (lower.includes('commission') || lower.includes('restricted')) {
          window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))
        }
        setApplying(false)
        return
      }

      if (result.alreadyApplied) {
        showToast('You already applied for this gig!')
        setApplying(false)
        return
      }

      setApplied(gig.id)
    } catch (e) {
      console.log('Apply error:', e)
      showToast('Error applying: ' + e.message, 'error')
    }
    setApplying(false)
  }

  const URGENCY_COLORS = {
    now: 'var(--color-danger)',
    today: 'var(--color-warning)',
    scheduled: 'var(--color-brand)',
    flexible: 'var(--color-text-subtle)'
  }

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '22px', fontWeight: '800',
          color: 'var(--color-text)', marginBottom: '4px'
        }}>Saved Gigs</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {savedGigs.length > 0
            ? `${savedGigs.length} gig${savedGigs.length !== 1 ? 's' : ''} saved`
            : 'Gigs you bookmarked for later'}
        </div>
      </div>

      {loading ? (
        <ScreenLoader />
      ) : savedGigs.length === 0 ? (
        <EmptyState
          icon="saved"
          title="No saved gigs yet"
          message="Tap the bookmark icon on any gig in the Feed or Map to save it here."
          actionLabel="Browse gigs"
          onAction={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'feed' }))}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {savedGigs.map(saved => {
            const gig = saved.gigs
            const color = URGENCY_COLORS[gig.urgency] || 'var(--color-brand)'
            const isApplied = applied === gig.id
            const isOwnGig = gig.poster_id === user?.id

            return (
              <div key={saved.id} style={{
                background: 'var(--color-surface)',
                border: '1.5px solid var(--color-border)',
                borderRadius: '16px', overflow: 'hidden',
                transition: 'all 0.15s'
              }}>
                {/* Gig Card */}
                <div
                  onClick={() => setSelectedGig(
                    selectedGig?.id === gig.id ? null : gig
                  )}
                  style={{ padding: '16px 18px', cursor: 'pointer' }}>
                  {/* Top Row */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '10px'
                  }}>
                    <div style={{ flex: 1, paddingRight: '10px' }}>
                      <div style={{
                        display: 'flex', gap: '6px',
                        flexWrap: 'wrap', marginBottom: '7px'
                      }}>
                        <span style={{
                          background: color + '18',
                          border: `1px solid ${color}44`,
                          borderRadius: '5px', padding: '2px 8px',
                          fontSize: '12px', fontWeight: '800',
                          color, letterSpacing: '0.8px',
                          display: 'flex', alignItems: 'center', gap: '3px'
                        }}>
                          {gig.urgency?.toUpperCase()}
                        </span>
                        <span style={{
                          background: gig.type === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)',
                          border: `1px solid ${gig.type === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)'}`,
                          borderRadius: '5px', padding: '2px 8px',
                          fontSize: '12px', fontWeight: '700',
                          color: gig.type === 'physical' ? 'var(--color-warning)' : 'var(--color-brand)'
                        }}>
                          {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                        </span>
                        {gig.field && (
                          <span style={{
                            background: 'var(--color-page)', border: '1px solid var(--color-border)',
                            borderRadius: '5px', padding: '2px 8px',
                            fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)'
                          }}>{gig.field}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '15px', fontWeight: '700', color: 'var(--color-text)'
                      }}>{gig.title}</div>
                    </div>

                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'flex-end', gap: '6px', flexShrink: 0
                    }}>
                      <div style={{
                        fontSize: '16px', fontWeight: '800', color: 'var(--color-success)'
                      }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          unsaveGig(gig.id)
                        }}
                        style={{
                          background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                          borderRadius: '8px', padding: '4px 8px',
                          fontSize: '12px', fontWeight: '700',
                          color: 'var(--color-danger)', cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                        <BrandIcon name="unsaved" size={18} active={false} />
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Poster + Location */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingProfile(gig.poster?.id)
                      }}
                      style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: 'var(--color-brand-soft)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '800',
                        color: 'var(--color-brand)', overflow: 'hidden',
                        flexShrink: 0, cursor: 'pointer',
                        border: '1.5px solid var(--color-brand-border-strong)'
                      }}>
                      {gig.poster?.avatar_url ? (
                        <img src={gig.poster.avatar_url} alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : gig.poster?.full_name?.charAt(0) || '?'}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {gig.poster?.full_name || 'Anonymous'}
                    </span>
                    {gig.location && (
                      <span style={{ fontSize: '12px', color: 'var(--color-warning)' }}>
                        📍 {gig.location}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {selectedGig?.id === gig.id && (
                  <div style={{
                    borderTop: '1px solid var(--color-page)',
                    padding: '14px 18px', background: 'var(--color-surface-tint)'
                  }}>
                    {/* Poster info */}
                    <div style={{
                      display: 'flex', gap: '10px',
                      alignItems: 'center', marginBottom: '14px',
                      padding: '12px', background: 'var(--color-surface)',
                      borderRadius: '12px', border: '1px solid var(--color-border)'
                    }}>
                      <div
                        onClick={() => setViewingProfile(gig.poster?.id)}
                        style={{
                          width: '44px', height: '44px', borderRadius: '12px',
                          background: 'var(--color-brand-soft)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '16px', fontWeight: '800',
                          color: 'var(--color-brand)', overflow: 'hidden',
                          flexShrink: 0, cursor: 'pointer',
                          border: '2px solid var(--color-brand-border-strong)'
                        }}>
                        {gig.poster?.avatar_url ? (
                          <img src={gig.poster.avatar_url} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : gig.poster?.full_name?.charAt(0) || '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          onClick={() => setViewingProfile(gig.poster?.id)}
                          style={{
                            fontSize: '14px', fontWeight: '700',
                            color: 'var(--color-brand)', cursor: 'pointer',
                            marginBottom: '2px'
                          }}>
                          {gig.poster?.full_name || 'Anonymous'} →
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          ⭐ {gig.poster?.rating || 5.0} ·{' '}
                          {gig.poster?.gigs_completed || 0} gigs ·{' '}
                          Trust {gig.poster?.trust_score || 100}%
                        </div>
                      </div>
                    </div>

                    {/* Pay + Location */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '8px', marginBottom: '10px'
                    }}>
                      <div style={{
                        background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
                        borderRadius: '12px', padding: '12px'
                      }}>
                        <div style={{
                          fontSize: '12px', color: 'var(--color-success)', fontWeight: '700',
                          textTransform: 'uppercase', letterSpacing: '0.8px',
                          marginBottom: '3px'
                        }}>Pay Range</div>
                        <div style={{
                          fontSize: '18px', fontWeight: '800', color: 'var(--color-success)'
                        }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-success)', opacity: 0.7 }}>
                          up to {getCurrencySymbol(gig.currency)}{gig.pay_max}
                        </div>
                      </div>
                      <div style={{
                        background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)',
                        borderRadius: '12px', padding: '12px'
                      }}>
                        <div style={{
                          fontSize: '12px', color: 'var(--color-warning)', fontWeight: '700',
                          textTransform: 'uppercase', letterSpacing: '0.8px',
                          marginBottom: '3px'
                        }}>Location</div>
                        <div style={{
                          fontSize: '12px', fontWeight: '700', color: 'var(--color-text)'
                        }}>{gig.location || 'Remote'}</div>
                      </div>
                    </div>

                    {/* Description */}
                    {gig.description && (
                      <div style={{
                        background: 'var(--color-surface)', borderRadius: '10px',
                        padding: '12px', marginBottom: '12px',
                        fontSize: '12px', color: 'var(--color-text-muted)',
                        lineHeight: '1.6', border: '1px solid var(--color-border)'
                      }}>{gig.description}</div>
                    )}

                    {/* Saved date */}
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-subtle)',
                      marginBottom: '12px',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      <BrandIcon name="saved" size={16} />
                      Saved {parseTimestamp(saved.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                      })}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={() => setSharingGig(gig)}
                        style={{
                          width: '100%', background: 'var(--color-page)',
                          border: '1.5px solid var(--color-brand-border-strong)',
                          borderRadius: '10px', padding: '11px',
                          fontSize: '13px', fontWeight: '700',
                          color: 'var(--color-brand)', cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '6px'
                        }}>
                        🔗 Share & Earn Credits
                      </button>
                      <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          if (isOwnGig) return
                          setSelectedGig(null)
                          window.dispatchEvent(new CustomEvent('openChatWithUser', {
                            detail: { userId: gig.poster_id }
                          }))
                        }}
                        disabled={isOwnGig}
                        style={{
                          flex: 1, background: 'var(--color-page)',
                          border: `1.5px solid ${isOwnGig ? 'var(--color-border)' : 'var(--color-brand-border-strong)'}`,
                          borderRadius: '10px', padding: '11px',
                          fontSize: '12px', fontWeight: '700',
                          color: isOwnGig ? 'var(--color-text-subtle)' : 'var(--color-brand)',
                          cursor: isOwnGig ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '6px'
                        }}>
                        <BrandIcon name="chat" size={20} active />
                        {isOwnGig ? 'Your gig' : 'Message'}
                      </button>
                      <button
                        onClick={() => handleApply(gig)}
                        disabled={applying || isApplied || isOwnGig}
                        style={{
                          flex: 2,
                          background: isOwnGig
                            ? 'var(--color-page)'
                            : isApplied
                            ? 'var(--color-success-soft)'
                            : applying
                              ? 'var(--color-brand-border-strong)'
                              : 'var(--color-brand-gradient)',
                          border: isOwnGig ? '1.5px solid var(--color-border)' : isApplied ? '1.5px solid var(--color-success-border)' : 'none',
                          borderRadius: '10px', padding: '11px',
                          fontSize: '13px', fontWeight: '700',
                          color: isOwnGig ? 'var(--color-text-subtle)' : isApplied ? 'var(--color-success)' : 'var(--color-surface)',
                          cursor: applying || isApplied || isOwnGig ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '6px',
                          boxShadow: isApplied || applying || isOwnGig ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
                        }}>
                        {isOwnGig ? (
                          'Your gig'
                        ) : isApplied ? (
                          <><BrandIcon name="accepted" size={18} /> Applied!</>
                        ) : applying ? (
                          '⏳ Applying...'
                        ) : (
                          <><BrandIcon name="open" size={18} /> Apply Now</>
                        )}
                      </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Public Profile */}
      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      {sharingGig && (
        <ShareGig gig={sharingGig} onClose={() => setSharingGig(null)} />
      )}

      {showProfilePrompt && (
        <ProfilePrompt
          profile={profile}
          onClose={() => setShowProfilePrompt(false)}
          onGoToProfile={() => {
            setShowProfilePrompt(false)
            window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
          }}
        />
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
          <BrandIcon name="unsaved" size={22} />
          {saveNotice}
        </div>
      )}

      <style>{`
      `}</style>
    </div>
  )
}
