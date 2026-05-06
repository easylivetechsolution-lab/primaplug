import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'

const FIELDS = [
  { name: 'Development', icon: '⌨', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  { name: 'Design', icon: '✦', color: '#FF4DCF', bg: '#FFE8FA', border: '#FF99E8' },
  { name: 'Writing', icon: '✍', color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
  { name: 'Marketing', icon: '📣', color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99' },
  { name: 'Photography', icon: '◉', color: '#0EA5E9', bg: '#E0F2FE', border: '#7DD3FC' },
  { name: 'Events', icon: '◈', color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' },
  { name: 'Handyman', icon: '⚙', color: '#FFB800', bg: '#FFF8E0', border: '#FFD966' },
  { name: 'Cleaning', icon: '◇', color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
  { name: 'Electrical', icon: '⚡', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
]

const RELATED = {
  Development: ['DevOps', 'Mobile Dev', 'QA Testing', 'API Work', 'Cloud Setup'],
  Design: ['Motion Graphics', 'UI/UX', 'Packaging', 'Illustration', 'Brand Strategy'],
  Writing: ['Translation', 'Script Writing', 'Editing', 'Technical Docs', 'Email Copy'],
  Marketing: ['Paid Ads', 'Email Campaigns', 'Analytics', 'SEO', 'Community Mgmt'],
  Photography: ['Video Editing', 'Drone Footage', 'Event Film', 'Headshots', 'Product Shots'],
  Events: ['Photography', 'Catering Help', 'Setup Crew', 'Security', 'MC / Host'],
  Handyman: ['Plumbing', 'Painting', 'Carpentry', 'Flooring', 'Furniture Assembly'],
  Cleaning: ['Window Clean', 'Carpet Clean', 'Office Clean', 'Move-Out', 'Deep Clean'],
  Electrical: ['Plumbing', 'HVAC', 'Solar Install', 'Smart Home', 'Generator'],
}

export default function DiscoverScreen() {
  const { user } = useAuth()
  const [selectedField, setSelectedField] = useState(null)
  const [gigs, setGigs] = useState([])
  const [allGigs, setAllGigs] = useState([])
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const [selectedGig, setSelectedGig] = useState(null)

  useEffect(() => {
    fetchAllGigs()
    fetchProfile()
  }, [])

  useEffect(() => {
    if (selectedField) {
      fetchGigsByField(selectedField)
    }
  }, [selectedField])

  const fetchProfile = async () => {
    if (!user) return
    const { data } = await supabase
      .from('users')
      .select('skills, physical_mode, digital_mode')
      .eq('id', user.id)
      .maybeSingle()
    if (data) setProfile(data)
  }

  const fetchAllGigs = async () => {
    const { data } = await supabase
      .from('gigs')
      .select('*, users(full_name, trust_score, rating, avatar_url)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (data) setAllGigs(data)
  }

  const fetchGigsByField = async (field) => {
    setLoading(true)
    const { data } = await supabase
      .from('gigs')
      .select('*, users(full_name, trust_score, rating, avatar_url)')
      .eq('status', 'open')
      .eq('field', field)
      .order('created_at', { ascending: false })
    if (data) setGigs(data)
    setLoading(false)
  }

  const GigCard = ({ gig }) => (
    <div onClick={() => setSelectedGig(gig)} style={{
      background: '#fff', border: '1.5px solid #E2E0FF',
      borderRadius: '14px', padding: '16px',
      cursor: 'pointer', transition: 'all 0.15s',
      marginBottom: '10px'
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
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        <div style={{ flex: 1, paddingRight: '10px' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#14123A', marginBottom: '6px' }}>
            {gig.title}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '6px',
              background: '#EEE9FF', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '10px',
              fontWeight: '800', color: '#6C47FF', overflow: 'hidden'
            }}>
              {gig.users?.avatar_url ? (
                <img src={gig.users.avatar_url} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                gig.users?.full_name?.charAt(0) || '?'
              )}
            </div>
            <span style={{ fontSize: '11px', color: '#8B8FAF' }}>
              {gig.users?.full_name || 'Anonymous'}
            </span>
            {gig.location && (
              <span style={{ fontSize: '10px', color: '#FF6B2B' }}>
                📍 {gig.location}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '16px', fontWeight: '800',
            color: '#00C48C', letterSpacing: '-0.3px'
          }}>${gig.pay_min}</div>
          <div style={{ fontSize: '10px', color: '#A09DC8' }}>–${gig.pay_max}</div>
        </div>
      </div>
    </div>
  )

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
        }}>Discover</div>
        <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
          Find opportunities by field and skill
        </div>
      </div>

      {/* Personalized section */}
      {profile?.skills && profile.skills.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #EEE9FF, #F8F5FF)',
          border: '1.5px solid #B8A5FF',
          borderRadius: '16px', padding: '16px', marginBottom: '20px'
        }}>
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#6C47FF',
            letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '12px'
          }}>Based on Your Skills</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {profile.skills.map(skill => {
              const field = FIELDS.find(f => f.name === skill)
              return (
                <button key={skill}
                  onClick={() => setSelectedField(skill)}
                  style={{
                    background: selectedField === skill ? '#6C47FF' : '#fff',
                    border: `1.5px solid ${selectedField === skill ? '#6C47FF' : '#B8A5FF'}`,
                    borderRadius: '20px', padding: '7px 14px',
                    fontSize: '12px', fontWeight: '600',
                    color: selectedField === skill ? '#fff' : '#6C47FF',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s'
                  }}>{field?.icon} {skill}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Field Grid */}
      <div style={{
        fontSize: '11px', fontWeight: '700', color: '#A09DC8',
        textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '12px'
      }}>Browse by Field</div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: '10px', marginBottom: '24px'
      }}>
        {FIELDS.map(field => {
          const count = allGigs.filter(g => g.field === field.name).length
          const active = selectedField === field.name
          return (
            <div key={field.name}
              onClick={() => setSelectedField(
                selectedField === field.name ? null : field.name
              )}
              style={{
                background: active ? field.bg : '#fff',
                border: `1.5px solid ${active ? field.border : '#E2E0FF'}`,
                borderRadius: '14px', padding: '14px 10px',
                cursor: 'pointer', transition: 'all 0.15s',
                textAlign: 'center'
              }}>
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>
                {field.icon}
              </div>
              <div style={{
                fontSize: '12px', fontWeight: '700',
                color: active ? field.color : '#14123A',
                marginBottom: '2px'
              }}>{field.name}</div>
              <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                {count} gig{count !== 1 ? 's' : ''}
              </div>
              <div style={{
                height: '2px', borderRadius: '2px',
                background: active ? field.color : '#E2E0FF',
                marginTop: '8px',
                width: active ? '60%' : '25%',
                margin: '8px auto 0',
                transition: 'all 0.3s'
              }} />
            </div>
          )
        })}
      </div>

      {/* Related Services */}
      {selectedField && RELATED[selectedField] && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#A09DC8',
            textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '10px'
          }}>Related to {selectedField}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {RELATED[selectedField].map(r => (
              <span key={r} style={{
                background: '#fff', border: '1.5px solid #E2E0FF',
                borderRadius: '20px', padding: '6px 13px',
                fontSize: '12px', color: '#8B8FAF',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#B8A5FF'
                  e.currentTarget.style.color = '#6C47FF'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#E2E0FF'
                  e.currentTarget.style.color = '#8B8FAF'
                }}>{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* Gigs in Selected Field */}
      {selectedField && (
        <div>
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#A09DC8',
            textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '12px'
          }}>
            {loading ? 'Loading...' : `${gigs.length} Gig${gigs.length !== 1 ? 's' : ''} in ${selectedField}`}
          </div>
          {loading ? (
            <div style={{
              textAlign: 'center', padding: '32px',
              color: '#A09DC8', fontSize: '14px'
            }}>Loading gigs...</div>
          ) : gigs.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px',
              background: '#fff', borderRadius: '16px',
              border: '1.5px solid #E2E0FF'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔍</div>
              <div style={{
                fontSize: '14px', fontWeight: '700',
                color: '#14123A', marginBottom: '6px'
              }}>No gigs in {selectedField} yet</div>
              <div style={{ fontSize: '12px', color: '#A09DC8' }}>
                Be the first to post one!
              </div>
            </div>
          ) : (
            gigs.map(gig => <GigCard key={gig.id} gig={gig} />)
          )}
        </div>
      )}

      {/* Gig Detail Sheet */}
      {selectedGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 300,
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center'
        }} onClick={() => setSelectedGig(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '85vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: '#E2E0FF', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />
            <h2 style={{
              fontSize: '18px', fontWeight: '800',
              color: '#14123A', marginBottom: '12px'
            }}>{selectedGig.title}</h2>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '10px', marginBottom: '16px'
            }}>
              <div style={{
                background: '#DFFDF4', border: '1.5px solid #7EECD2',
                borderRadius: '12px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '9px', color: '#00C48C', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Pay Range</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800', color: '#00C48C'
                }}>${selectedGig.pay_min}</div>
                <div style={{ fontSize: '11px', color: '#00C48C', opacity: 0.7 }}>
                  up to ${selectedGig.pay_max}
                </div>
              </div>
              <div style={{
                background: '#FFF0E8', border: '1.5px solid #FFBC99',
                borderRadius: '12px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '9px', color: '#FF6B2B', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Location</div>
                <div style={{
                  fontSize: '13px', fontWeight: '700', color: '#14123A'
                }}>{selectedGig.location || 'Remote'}</div>
              </div>
            </div>
            {selectedGig.description && (
              <div style={{
                background: '#F5F4FF', borderRadius: '12px',
                padding: '14px', marginBottom: '16px',
                fontSize: '13px', color: '#5B5887', lineHeight: '1.6'
              }}>{selectedGig.description}</div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setSelectedGig(null)} style={{
                flex: 1, background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '12px', padding: '13px',
                fontSize: '13px', fontWeight: '600',
                color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
              }}>Close</button>
              <button style={{
                flex: 2,
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', padding: '13px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(108,71,255,0.3)'
              }}>⚡ Apply for This Gig</button>
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
  )
}