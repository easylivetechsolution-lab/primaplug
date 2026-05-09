import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PostService from '../PostService'
import ServiceDetail from '../ServiceDetail'
import PublicProfile from '../PublicProfile'
import { CATEGORIES } from '../../data/categories'

export default function ServicesScreen() {
  const { user } = useAuth()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPost, setShowPost] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    fetchServices()
  }, [])

  const fetchServices = async () => {
    const { data } = await supabase
      .from('services')
      .select('*, users(id, full_name, avatar_url, trust_score, rating, level)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (data) setServices(data)
    setLoading(false)
  }

  const filtered = services.filter(s => {
    if (typeFilter !== 'all' && s.type !== typeFilter) return false
    if (activeCategory !== 'All') {
      const cat = CATEGORIES.find(c => c.group === activeCategory)
      if (cat && !cat.fields.includes(s.field)) return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        s.title?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.field?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const getLevelBadge = (level) => {
    const levels = {
      elite: { icon: '🏆', color: '#FFB800', bg: '#FFF8E0', border: '#FFD966' },
      pro: { icon: '🎯', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
      rising: { icon: '⚡', color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99' },
      new: { icon: '🌱', color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF' },
    }
    return levels[level] || levels.new
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 0',
        background: '#fff',
        borderBottom: '1.5px solid #E2E0FF',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '14px'
        }}>
          <div>
            <div style={{
              fontSize: '20px', fontWeight: '800', color: '#14123A'
            }}>Services</div>
            <div style={{ fontSize: '12px', color: '#8B8FAF' }}>
              {services.length} services available
            </div>
          </div>
          <button
            onClick={() => setShowPost(true)}
            style={{
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', borderRadius: '12px',
              padding: '10px 16px', fontSize: '13px',
              fontWeight: '700', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 4px 16px rgba(108,71,255,0.35)'
            }}>
            + Offer Service
          </button>
        </div>

        {/* Search */}
        <div style={{
          position: 'relative', marginBottom: '12px'
        }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search services..."
            style={{
              width: '100%', background: '#F5F4FF',
              border: '1.5px solid #E2E0FF', borderRadius: '12px',
              padding: '10px 14px 10px 38px',
              fontSize: '13px', color: '#14123A',
              fontFamily: 'inherit', outline: 'none',
              boxSizing: 'border-box'
            }}
            onFocus={e => e.target.style.borderColor = '#B8A5FF'}
            onBlur={e => e.target.style.borderColor = '#E2E0FF'}
          />
          <span style={{
            position: 'absolute', left: '12px',
            top: '50%', transform: 'translateY(-50%)',
            fontSize: '15px', pointerEvents: 'none'
          }}>🔍</span>
        </div>

        {/* Type Filter */}
        <div style={{
          display: 'flex', gap: '6px', marginBottom: '12px'
        }}>
          {[
            { key: 'all', label: '✦ All' },
            { key: 'digital', label: '💻 Digital' },
            { key: 'physical', label: '📌 Physical' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              style={{
                background: typeFilter === t.key ? '#6C47FF' : 'transparent',
                border: `1.5px solid ${typeFilter === t.key ? '#6C47FF' : '#E2E0FF'}`,
                borderRadius: '20px', padding: '5px 13px',
                fontSize: '12px', fontWeight: '600',
                color: typeFilter === t.key ? '#fff' : '#8B8FAF',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>{t.label}</button>
          ))}
        </div>

        {/* Category Filter */}
        <div style={{
          display: 'flex', gap: '7px',
          overflowX: 'auto', paddingBottom: '12px',
          scrollbarWidth: 'none'
        }}>
          <button
            onClick={() => setActiveCategory('All')}
            style={{
              background: activeCategory === 'All' ? '#6C47FF' : 'transparent',
              border: `1.5px solid ${activeCategory === 'All' ? '#6C47FF' : '#E2E0FF'}`,
              borderRadius: '20px', padding: '5px 13px',
              fontSize: '12px', fontWeight: '600',
              color: activeCategory === 'All' ? '#fff' : '#8B8FAF',
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit'
            }}>✦ All</button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.group}
              onClick={() => setActiveCategory(
                activeCategory === cat.group ? 'All' : cat.group
              )}
              style={{
                background: activeCategory === cat.group ? cat.bg : 'transparent',
                border: `1.5px solid ${activeCategory === cat.group ? cat.border : '#E2E0FF'}`,
                borderRadius: '20px', padding: '5px 13px',
                fontSize: '12px', fontWeight: '600',
                color: activeCategory === cat.group ? cat.color : '#8B8FAF',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'inherit', transition: 'all 0.15s'
              }}>
              {cat.icon} {cat.group}
            </button>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '16px 20px 100px'
      }}>
        {loading ? (
          <div style={{
            textAlign: 'center', padding: '48px',
            color: '#A09DC8', fontSize: '14px'
          }}>Loading services...</div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            background: '#fff', borderRadius: '20px',
            border: '1.5px solid #E2E0FF'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🛠</div>
            <div style={{
              fontSize: '16px', fontWeight: '700',
              color: '#14123A', marginBottom: '6px'
            }}>No services found</div>
            <div style={{ fontSize: '13px', color: '#A09DC8', marginBottom: '20px' }}>
              Be the first to offer a service!
            </div>
            <button
              onClick={() => setShowPost(true)}
              style={{
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px',
                padding: '12px 24px', fontSize: '13px',
                fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>+ Offer Your Service</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px'
          }}>
            {filtered.map(service => {
              const levelBadge = getLevelBadge(service.users?.level)
              return (
                <div
                  key={service.id}
                  onClick={() => setSelectedService(service)}
                  style={{
                    background: '#fff',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '18px', overflow: 'hidden',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#B8A5FF'
                    e.currentTarget.style.transform = 'translateY(-3px)'
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(108,71,255,0.12)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#E2E0FF'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}>
                  {/* Service Header */}
                  {service.images?.[0] ? (
                    <div style={{
                      height: '140px', position: 'relative',
                      overflow: 'hidden', background: '#F5F4FF'
                    }}>
                      <img src={service.images[0]} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {service.images.length > 1 && (
                        <div style={{
                          position: 'absolute', bottom: '8px', right: '8px',
                          background: 'rgba(20,18,58,0.65)', backdropFilter: 'blur(4px)',
                          borderRadius: '6px', padding: '2px 8px',
                          fontSize: '10px', fontWeight: '700', color: '#fff'
                        }}>
                          +{service.images.length - 1} photos
                        </div>
                      )}
                      {/* Badges overlay */}
                      <div style={{
                        position: 'absolute', bottom: '8px', left: '8px',
                        display: 'flex', gap: '5px', flexWrap: 'wrap'
                      }}>
                        {service.field && (
                          <span style={{
                            background: 'rgba(255,255,255,0.9)',
                            border: '1px solid #E2E0FF',
                            borderRadius: '5px', padding: '2px 8px',
                            fontSize: '9px', fontWeight: '600', color: '#8B8FAF'
                          }}>{service.field}</span>
                        )}
                        <span style={{
                          background: service.type === 'digital'
                            ? 'rgba(108,71,255,0.9)' : 'rgba(255,107,43,0.9)',
                          borderRadius: '5px', padding: '2px 8px',
                          fontSize: '9px', fontWeight: '700', color: '#fff'
                        }}>
                          {service.type === 'digital' ? '💻 Digital' : '📌 Physical'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      background: 'linear-gradient(135deg, #EEE9FF, #F8F5FF)',
                      padding: '20px', position: 'relative'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '10px' }}>
                        {CATEGORIES.find(c => c.fields.includes(service.field))?.icon || '🛠'}
                      </div>
                      <div style={{
                        fontSize: '15px', fontWeight: '700',
                        color: '#14123A', lineHeight: '1.3', marginBottom: '6px'
                      }}>{service.title}</div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {service.field && (
                          <span style={{
                            background: '#fff', border: '1px solid #E2E0FF',
                            borderRadius: '5px', padding: '2px 8px',
                            fontSize: '9px', fontWeight: '600', color: '#8B8FAF'
                          }}>{service.field}</span>
                        )}
                        <span style={{
                          background: service.type === 'digital' ? '#EEE9FF' : '#FFF0E8',
                          border: `1px solid ${service.type === 'digital' ? '#B8A5FF' : '#FFBC99'}`,
                          borderRadius: '5px', padding: '2px 8px',
                          fontSize: '9px', fontWeight: '700',
                          color: service.type === 'digital' ? '#6C47FF' : '#FF6B2B'
                        }}>
                          {service.type === 'digital' ? '💻 Digital' : '📌 Physical'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '14px 16px' }}>
                    {/* Title (shown here only when there's an image header) */}
                    {service.images?.[0] && (
                      <div style={{
                        fontSize: '15px', fontWeight: '700',
                        color: '#14123A', lineHeight: '1.3', marginBottom: '8px'
                      }}>{service.title}</div>
                    )}
                    {/* Description */}
                    {service.description && (
                      <div style={{
                        fontSize: '12px', color: '#8B8FAF',
                        lineHeight: '1.5', marginBottom: '12px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>{service.description}</div>
                    )}

                    {/* Packages preview */}
                    <div style={{
                      display: 'flex', gap: '5px',
                      marginBottom: '14px'
                    }}>
                      {service.basic_price && (
                        <div style={{
                          flex: 1, background: '#DFFDF4',
                          border: '1px solid #7EECD2',
                          borderRadius: '8px', padding: '6px',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            fontSize: '11px', fontWeight: '800',
                            color: '#00C48C'
                          }}>${service.basic_price}</div>
                          <div style={{
                            fontSize: '8px', color: '#00C48C', opacity: 0.7
                          }}>Basic</div>
                        </div>
                      )}
                      {service.standard_price && (
                        <div style={{
                          flex: 1, background: '#EEE9FF',
                          border: '1px solid #B8A5FF',
                          borderRadius: '8px', padding: '6px',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            fontSize: '11px', fontWeight: '800',
                            color: '#6C47FF'
                          }}>${service.standard_price}</div>
                          <div style={{
                            fontSize: '8px', color: '#6C47FF', opacity: 0.7
                          }}>Standard</div>
                        </div>
                      )}
                      {service.premium_price && (
                        <div style={{
                          flex: 1, background: '#FFF8E0',
                          border: '1px solid #FFD966',
                          borderRadius: '8px', padding: '6px',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            fontSize: '11px', fontWeight: '800',
                            color: '#FFB800'
                          }}>${service.premium_price}</div>
                          <div style={{
                            fontSize: '8px', color: '#FFB800', opacity: 0.7
                          }}>Premium</div>
                        </div>
                      )}
                    </div>

                    {/* Worker info */}
                    <div style={{
                      display: 'flex', gap: '8px',
                      alignItems: 'center',
                      paddingTop: '12px',
                      borderTop: '1px solid #F5F4FF'
                    }}>
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewingProfile(service.users?.id)
                        }}
                        style={{
                          width: '30px', height: '30px',
                          borderRadius: '8px', background: '#EEE9FF',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '12px',
                          fontWeight: '800', color: '#6C47FF',
                          overflow: 'hidden', flexShrink: 0,
                          cursor: 'pointer', border: '1.5px solid #B8A5FF'
                        }}>
                        {service.users?.avatar_url ? (
                          <img src={service.users.avatar_url} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : service.users?.full_name?.charAt(0) || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '11px', fontWeight: '600',
                          color: '#14123A', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {service.users?.full_name || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                          ⭐ {service.users?.rating || 5.0} · Trust {service.users?.trust_score || 100}%
                        </div>
                      </div>
                      <div style={{
                        background: levelBadge.bg,
                        border: `1px solid ${levelBadge.border}`,
                        borderRadius: '6px', padding: '3px 7px',
                        fontSize: '10px', fontWeight: '700',
                        color: levelBadge.color, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: '3px'
                      }}>
                        {levelBadge.icon}
                        {service.users?.level?.charAt(0).toUpperCase() +
                          service.users?.level?.slice(1) || 'New'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Post Service Modal */}
      {showPost && (
        <PostService
          onClose={() => setShowPost(false)}
          onPosted={() => {
            setShowPost(false)
            fetchServices()
          }}
        />
      )}

      {/* Service Detail */}
      {selectedService && (
        <ServiceDetail
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onViewProfile={(id) => setViewingProfile(id)}
        />
      )}

      {/* Public Profile */}
      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}
    </div>
  )
}