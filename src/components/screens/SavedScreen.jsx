import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import { getCurrency } from '../../data/currencies'

const getCurrencySymbol = (code) => getCurrency(code || 'USD').symbol

export default function SavedScreen() {
  const { user } = useAuth()
  const [savedGigs, setSavedGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGig, setSelectedGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(null)

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
          users (
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
  }

  const handleApply = async (gig) => {
    setApplying(true)
    try {
      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('gig_id', gig.id)
        .eq('worker_id', user.id)
        .maybeSingle()

      if (existing) {
        alert('You already applied for this gig!')
        setApplying(false)
        return
      }

      await supabase.from('applications').insert({
        gig_id: gig.id,
        worker_id: user.id,
        status: 'pending'
      })

      await supabase.from('notifications').insert({
        user_id: gig.poster_id,
        title: 'New Application!',
        message: `Someone applied for your gig "${gig.title}"`,
        type: 'application',
        gig_id: gig.id
      })

      const { data: existingConvo } = await supabase
        .from('conversations')
        .select('id')
        .eq('gig_id', gig.id)
        .eq('participant_1', gig.poster_id)
        .eq('participant_2', user.id)
        .maybeSingle()

      if (!existingConvo) {
        await supabase.from('conversations').insert({
          gig_id: gig.id,
          participant_1: gig.poster_id,
          participant_2: user.id,
          last_message: 'Application sent',
          last_message_at: new Date().toISOString()
        })
      }

      setApplied(gig.id)
    } catch (e) {
      console.log('Apply error:', e)
    }
    setApplying(false)
  }

  const URGENCY_COLORS = {
    now: '#FF3366',
    today: '#FF6B2B',
    scheduled: '#6C47FF',
    flexible: '#A09DC8'
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
          color: '#14123A', marginBottom: '4px'
        }}>Saved Gigs</div>
        <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
          {savedGigs.length > 0
            ? `${savedGigs.length} gig${savedGigs.length !== 1 ? 's' : ''} saved`
            : 'Gigs you bookmarked for later'}
        </div>
      </div>

      {loading ? (
        <div style={{
          textAlign: 'center', padding: '48px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <BrandIcon name="saved" size={46} />
          </div>
          <div style={{ fontSize: '14px', color: '#A09DC8', fontWeight: '600' }}>
            Loading saved gigs...
          </div>
        </div>
      ) : savedGigs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          background: '#fff', borderRadius: '20px',
          border: '1.5px solid #E2E0FF'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <BrandIcon name="saved" size={48} />
          </div>
          <div style={{
            fontSize: '16px', fontWeight: '700',
            color: '#14123A', marginBottom: '8px'
          }}>No saved gigs yet</div>
          <div style={{
            fontSize: '13px', color: '#A09DC8',
            lineHeight: '1.6', maxWidth: '260px', margin: '0 auto'
          }}>
            Tap the bookmark icon on any gig in the Feed or Map to save it here
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {savedGigs.map(saved => {
            const gig = saved.gigs
            const color = URGENCY_COLORS[gig.urgency] || '#6C47FF'
            const isApplied = applied === gig.id

            return (
              <div key={saved.id} style={{
                background: '#fff',
                border: '1.5px solid #E2E0FF',
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
                          fontSize: '9px', fontWeight: '800',
                          color, letterSpacing: '0.8px',
                          display: 'flex', alignItems: 'center', gap: '3px'
                        }}>
                          {gig.urgency === 'now' && (
                            <span style={{
                              width: '5px', height: '5px',
                              borderRadius: '50%', background: color,
                              display: 'inline-block',
                              animation: 'blink 0.9s infinite'
                            }} />
                          )}
                          {gig.urgency?.toUpperCase()}
                        </span>
                        <span style={{
                          background: gig.type === 'physical' ? '#FFF0E8' : '#EEE9FF',
                          border: `1px solid ${gig.type === 'physical' ? '#FFBC99' : '#B8A5FF'}`,
                          borderRadius: '5px', padding: '2px 8px',
                          fontSize: '9px', fontWeight: '700',
                          color: gig.type === 'physical' ? '#FF6B2B' : '#6C47FF'
                        }}>
                          {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                        </span>
                        {gig.field && (
                          <span style={{
                            background: '#F5F4FF', border: '1px solid #E2E0FF',
                            borderRadius: '5px', padding: '2px 8px',
                            fontSize: '9px', fontWeight: '600', color: '#8B8FAF'
                          }}>{gig.field}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '15px', fontWeight: '700', color: '#14123A'
                      }}>{gig.title}</div>
                    </div>

                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'flex-end', gap: '6px', flexShrink: 0
                    }}>
                      <div style={{
                        fontSize: '16px', fontWeight: '800', color: '#00C48C'
                      }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          unsaveGig(gig.id)
                        }}
                        style={{
                          background: '#FFE8EE', border: '1.5px solid #FF99B3',
                          borderRadius: '8px', padding: '4px 8px',
                          fontSize: '11px', fontWeight: '700',
                          color: '#FF3366', cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                        <BrandIcon name="saved" size={16} />
                        Saved
                      </button>
                    </div>
                  </div>

                  {/* Poster + Location */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingProfile(gig.users?.id)
                      }}
                      style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: '#EEE9FF', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800',
                        color: '#6C47FF', overflow: 'hidden',
                        flexShrink: 0, cursor: 'pointer',
                        border: '1.5px solid #B8A5FF'
                      }}>
                      {gig.users?.avatar_url ? (
                        <img src={gig.users.avatar_url} alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : gig.users?.full_name?.charAt(0) || '?'}
                    </div>
                    <span style={{ fontSize: '12px', color: '#8B8FAF' }}>
                      {gig.users?.full_name || 'Anonymous'}
                    </span>
                    {gig.location && (
                      <span style={{ fontSize: '11px', color: '#FF6B2B' }}>
                        📍 {gig.location}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {selectedGig?.id === gig.id && (
                  <div style={{
                    borderTop: '1px solid #F5F4FF',
                    padding: '14px 18px', background: '#F8F7FF'
                  }}>
                    {/* Poster info */}
                    <div style={{
                      display: 'flex', gap: '10px',
                      alignItems: 'center', marginBottom: '14px',
                      padding: '12px', background: '#fff',
                      borderRadius: '12px', border: '1px solid #E2E0FF'
                    }}>
                      <div
                        onClick={() => setViewingProfile(gig.users?.id)}
                        style={{
                          width: '44px', height: '44px', borderRadius: '12px',
                          background: '#EEE9FF', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '16px', fontWeight: '800',
                          color: '#6C47FF', overflow: 'hidden',
                          flexShrink: 0, cursor: 'pointer',
                          border: '2px solid #B8A5FF'
                        }}>
                        {gig.users?.avatar_url ? (
                          <img src={gig.users.avatar_url} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : gig.users?.full_name?.charAt(0) || '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          onClick={() => setViewingProfile(gig.users?.id)}
                          style={{
                            fontSize: '14px', fontWeight: '700',
                            color: '#6C47FF', cursor: 'pointer',
                            marginBottom: '2px'
                          }}>
                          {gig.users?.full_name || 'Anonymous'} →
                        </div>
                        <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                          ⭐ {gig.users?.rating || 5.0} ·{' '}
                          {gig.users?.gigs_completed || 0} gigs ·{' '}
                          Trust {gig.users?.trust_score || 100}%
                        </div>
                      </div>
                    </div>

                    {/* Pay + Location */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '8px', marginBottom: '10px'
                    }}>
                      <div style={{
                        background: '#DFFDF4', border: '1.5px solid #7EECD2',
                        borderRadius: '12px', padding: '12px'
                      }}>
                        <div style={{
                          fontSize: '9px', color: '#00C48C', fontWeight: '700',
                          textTransform: 'uppercase', letterSpacing: '0.8px',
                          marginBottom: '3px'
                        }}>Pay Range</div>
                        <div style={{
                          fontSize: '18px', fontWeight: '800', color: '#00C48C'
                        }}>${gig.pay_min}</div>
                        <div style={{ fontSize: '10px', color: '#00C48C', opacity: 0.7 }}>
                          up to ${gig.pay_max}
                        </div>
                      </div>
                      <div style={{
                        background: '#FFF0E8', border: '1.5px solid #FFBC99',
                        borderRadius: '12px', padding: '12px'
                      }}>
                        <div style={{
                          fontSize: '9px', color: '#FF6B2B', fontWeight: '700',
                          textTransform: 'uppercase', letterSpacing: '0.8px',
                          marginBottom: '3px'
                        }}>Location</div>
                        <div style={{
                          fontSize: '12px', fontWeight: '700', color: '#14123A'
                        }}>{gig.location || 'Remote'}</div>
                      </div>
                    </div>

                    {/* Description */}
                    {gig.description && (
                      <div style={{
                        background: '#fff', borderRadius: '10px',
                        padding: '12px', marginBottom: '12px',
                        fontSize: '12px', color: '#5B5887',
                        lineHeight: '1.6', border: '1px solid #E2E0FF'
                      }}>{gig.description}</div>
                    )}

                    {/* Saved date */}
                    <div style={{
                      fontSize: '10px', color: '#A09DC8',
                      marginBottom: '12px',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      <BrandIcon name="saved" size={16} />
                      Saved {new Date(saved.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                      })}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          setSelectedGig(null)
                          window.dispatchEvent(new CustomEvent('openChatWithUser', {
                            detail: { userId: gig.poster_id, gigId: gig.id }
                          }))
                        }}
                        style={{
                          flex: 1, background: '#F5F4FF',
                          border: '1.5px solid #B8A5FF',
                          borderRadius: '10px', padding: '11px',
                          fontSize: '12px', fontWeight: '700',
                          color: '#6C47FF', cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '6px'
                        }}>
                        <BrandIcon name="chat" size={20} active />
                        Message
                      </button>
                      <button
                        onClick={() => handleApply(gig)}
                        disabled={applying || isApplied}
                        style={{
                          flex: 2,
                          background: isApplied
                            ? '#DFFDF4'
                            : applying
                              ? '#B8A5FF'
                              : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                          border: isApplied ? '1.5px solid #7EECD2' : 'none',
                          borderRadius: '10px', padding: '11px',
                          fontSize: '13px', fontWeight: '700',
                          color: isApplied ? '#00C48C' : '#fff',
                          cursor: applying || isApplied ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '6px',
                          boxShadow: isApplied || applying ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
                        }}>
                        {isApplied ? (
                          <><BrandIcon name="accepted" size={18} /> Applied!</>
                        ) : applying ? (
                          '⏳ Applying...'
                        ) : (
                          <><BrandIcon name="open" size={18} /> Apply Now</>
                        )}
                      </button>
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

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}
