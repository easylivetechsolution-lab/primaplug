import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function PublicProfile({ userId, onClose }) {
  const { user: currentUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [gigs, setGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState([])
  const [messaging, setMessaging] = useState(false)
  const [messageSent, setMessageSent] = useState(false)

  const isOwnProfile = currentUser?.id === userId

  useEffect(() => {
  if (userId) {
    fetchProfile()
    fetchUserGigs()
    fetchReviews()
  }
}, [userId])

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (data) setProfile(data)
    setLoading(false)
  }

  const fetchReviews = async () => {
  const { data } = await supabase
    .from('reviews')
    .select('*, users!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (data) setReviews(data)
}

  const handleMessage = async () => {
    if (!currentUser || isOwnProfile) return
    setMessaging(true)

    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_1.eq.${currentUser.id},participant_2.eq.${userId}),` +
          `and(participant_1.eq.${userId},participant_2.eq.${currentUser.id})`
        )
        .maybeSingle()

      let convoId = existing?.id

      if (!convoId) {
        const { data: newConvo } = await supabase
          .from('conversations')
          .insert({
            participant_1: currentUser.id,
            participant_2: userId,
            last_message: '',
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single()
        convoId = newConvo?.id
      }

      setMessaging(false)
      setMessageSent(true)

      setTimeout(() => {
        onClose()
        window.dispatchEvent(new CustomEvent('openChatWithUser', {
          detail: { userId, gigId: null }
        }))
      }, 600)
    } catch (e) {
      console.log('Message error:', e)
      setMessaging(false)
    }
  }

  const fetchUserGigs = async () => {
    const { data } = await supabase
      .from('gigs')
      .select('*')
      .eq('poster_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setGigs(data)
  }

  if (!userId) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 10000,
      display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff',
        borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '640px',
        maxHeight: '90vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        border: '1.5px solid #E2E0FF'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '12px auto 0'
        }} />

        {loading ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            color: '#A09DC8', fontSize: '14px'
          }}>Loading profile...</div>
        ) : !profile ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            color: '#A09DC8', fontSize: '14px'
          }}>Profile not found</div>
        ) : (
          <div style={{ padding: '20px 20px 40px' }}>

            {/* Hero */}
            <div style={{
              background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
              borderRadius: '20px', padding: '20px',
              color: '#fff', marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex', gap: '14px',
                alignItems: 'flex-start', marginBottom: '12px'
              }}>
                {/* Avatar */}
                <div style={{
                  width: '64px', height: '64px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.25)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '26px',
                  fontWeight: '800', border: '2px solid rgba(255,255,255,0.4)',
                  overflow: 'hidden', flexShrink: 0
                }}>
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    profile.full_name?.charAt(0)?.toUpperCase() || '?'
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '20px', fontWeight: '800', marginBottom: '2px'
                  }}>
                    {profile.full_name}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>
                    @{profile.username}
                  </div>
                  {profile.location && (
                    <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '6px' }}>
                      📍 {profile.location}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {profile.physical_mode && (
                      <span style={{
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '4px', padding: '2px 7px',
                        fontSize: '9px', fontWeight: '700', letterSpacing: '.5px'
                      }}>📌 PHYSICAL</span>
                    )}
                    {profile.digital_mode && (
                      <span style={{
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '4px', padding: '2px 7px',
                        fontSize: '9px', fontWeight: '700', letterSpacing: '.5px'
                      }}>💻 DIGITAL</span>
                    )}
                    {profile.is_verified && (
                      <span style={{
                        background: '#FFB800',
                        borderRadius: '4px', padding: '2px 7px',
                        fontSize: '9px', fontWeight: '700',
                        letterSpacing: '.5px', color: '#fff'
                      }}>✓ VERIFIED</span>
                    )}
                  </div>
                </div>

                {/* Trust */}
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '12px', padding: '10px 12px',
                  textAlign: 'center', flexShrink: 0
                }}>
                  <div style={{ fontSize: '20px', fontWeight: '800' }}>
                    {profile.trust_score || 100}%
                  </div>
                  <div style={{
                    fontSize: '8px', opacity: 0.7,
                    fontWeight: '700', letterSpacing: '.5px'
                  }}>TRUST</div>
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <div style={{
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '10px', padding: '10px 12px',
                  fontSize: '12px', lineHeight: '1.6'
                }}>{profile.bio}</div>
              )}
            </div>

            {/* Stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
              gap: '8px', marginBottom: '16px'
            }}>
              {[
                ['Trust', `${profile.trust_score || 100}%`, '#6C47FF'],
                ['Done', `${profile.gigs_completed || 0}`, '#00C48C'],
                ['Rating', `${profile.rating || 5.0}★`, '#FFB800'],
                ['Reviews', `${profile.reviews_count || 0}`, '#FF6B2B'],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  background: '#F5F4FF', borderRadius: '10px',
                  padding: '10px 6px', textAlign: 'center',
                  border: '1.5px solid #E2E0FF'
                }}>
                  <div style={{
                    fontSize: '16px', fontWeight: '800',
                    color, marginBottom: '2px'
                  }}>{val}</div>
                  <div style={{
                    fontSize: '8px', color: '#A09DC8',
                    fontWeight: '600', textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '10px'
                }}>Skills</div>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {profile.skills.map(skill => (
                    <span key={skill} style={{
                      background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                      borderRadius: '20px', padding: '6px 13px',
                      fontSize: '12px', fontWeight: '600', color: '#6C47FF'
                    }}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            {profile.work_experience && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '10px'
                }}>Experience</div>
                <div style={{
                  background: '#F5F4FF', borderRadius: '12px',
                  padding: '14px', fontSize: '13px',
                  color: '#5B5887', lineHeight: '1.7',
                  border: '1.5px solid #E2E0FF'
                }}>{profile.work_experience}</div>
              </div>
            )}

            {/* Active Gigs */}
            {gigs.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '10px'
                }}>Active Gigs ({gigs.length})</div>
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                  {gigs.map(gig => (
                    <div key={gig.id} style={{
                      background: '#F5F4FF', borderRadius: '12px',
                      padding: '12px 14px', border: '1.5px solid #E2E0FF',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{
                          fontSize: '13px', fontWeight: '700',
                          color: '#14123A', marginBottom: '3px'
                        }}>{gig.title}</div>
                        <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                          {gig.field} · {gig.type === 'physical' ? '📌 Local' : '💻 Remote'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '14px', fontWeight: '800', color: '#00C48C'
                      }}>
                        ${gig.pay_min}+
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {reviews.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '12px'
                }}>
                  Reviews ({reviews.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {reviews.map(review => (
                    <div key={review.id} style={{
                      background: '#F5F4FF', borderRadius: '14px',
                      padding: '14px', border: '1.5px solid #E2E0FF'
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', marginBottom: '8px'
                      }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: '#EEE9FF', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: '800',
                            color: '#6C47FF', overflow: 'hidden', flexShrink: 0
                          }}>
                            {review.users?.avatar_url ? (
                              <img src={review.users.avatar_url} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              review.users?.full_name?.charAt(0) || '?'
                            )}
                          </div>
                          <div>
                            <div style={{
                              fontSize: '12px', fontWeight: '700', color: '#14123A'
                            }}>
                              {review.users?.full_name || 'Anonymous'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                              {new Date(review.created_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {[1,2,3,4,5].map(s => (
                            <span key={s} style={{
                              fontSize: '14px',
                              filter: s <= review.rating ? 'none' : 'grayscale(1) opacity(0.3)'
                            }}>⭐</span>
                          ))}
                        </div>
                      </div>

                      {review.tags && review.tags.length > 0 && (
                        <div style={{
                          display: 'flex', gap: '5px',
                          flexWrap: 'wrap', marginBottom: '7px'
                        }}>
                          {review.tags.map(tag => (
                            <span key={tag} style={{
                              background: '#EEE9FF', borderRadius: '20px',
                              padding: '3px 9px', fontSize: '10px',
                              fontWeight: '600', color: '#6C47FF'
                            }}>{tag}</span>
                          ))}
                        </div>
                      )}

                      {review.comment && (
                        <div style={{
                          fontSize: '12px', color: '#5B5887', lineHeight: '1.6'
                        }}>{review.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!isOwnProfile && currentUser && (
                <button
                  onClick={handleMessage}
                  disabled={messaging || messageSent}
                  style={{
                    width: '100%', background: messageSent ? '#DFFDF4' : '#EEE9FF',
                    border: `1.5px solid ${messageSent ? '#7EECD2' : '#B8A5FF'}`,
                    borderRadius: '12px', padding: '13px',
                    fontSize: '13px', fontWeight: '700',
                    color: messageSent ? '#00C48C' : '#6C47FF',
                    cursor: messaging || messageSent ? 'default' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.2s'
                  }}>
                  {messageSent ? '✓ Opening Chat...' : messaging ? '⏳ Opening...' : '💬 Message'}
                </button>
              )}
              {profile.phone && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <a href={`tel:${profile.phone}`} style={{
                    flex: 1, background: '#EEE9FF',
                    border: '1.5px solid #B8A5FF',
                    borderRadius: '12px', padding: '13px',
                    fontSize: '13px', fontWeight: '700',
                    color: '#6C47FF', textDecoration: 'none',
                    textAlign: 'center'
                  }}>📞 Call</a>
                  <a
                    href={`https://wa.me/${profile.phone.replace(/\D/g, '')}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      flex: 2, background: '#25D366',
                      border: 'none', borderRadius: '12px',
                      padding: '13px', fontSize: '13px',
                      fontWeight: '700', color: '#fff',
                      textDecoration: 'none', textAlign: 'center'
                    }}>💬 WhatsApp</a>
                </div>
              )}

              {/* Links */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {profile.portfolio_url && (
                  <a href={profile.portfolio_url.startsWith('http')
                    ? profile.portfolio_url
                    : `https://${profile.portfolio_url}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                      borderRadius: '10px', padding: '8px 14px',
                      fontSize: '12px', fontWeight: '600',
                      color: '#6C47FF', textDecoration: 'none'
                    }}>🌐 Portfolio</a>
                )}
                {profile.social_linkedin && (
                  <a href={`https://${profile.social_linkedin}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                      borderRadius: '10px', padding: '8px 14px',
                      fontSize: '12px', fontWeight: '600',
                      color: '#0077B5', textDecoration: 'none'
                    }}>💼 LinkedIn</a>
                )}
                {profile.social_twitter && (
                  <a href={`https://${profile.social_twitter}`}
                    target="_blank" rel="noreferrer"
                    style={{
                      background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                      borderRadius: '10px', padding: '8px 14px',
                      fontSize: '12px', fontWeight: '600',
                      color: '#14123A', textDecoration: 'none'
                    }}>🐦 Twitter</a>
                )}
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}