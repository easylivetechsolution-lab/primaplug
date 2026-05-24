import { useEffect, useState, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../supabase'
import PublicProfile from '../PublicProfile'
import { playMapPing } from '../../utils/sounds'
import { useAuth } from '../../context/AuthContext'
import { getCurrency } from '../../data/currencies'
import { CATEGORIES } from '../../data/categories'
import { trackGigReferral } from '../../utils/referral'
import ShareGig from '../ShareGig'
import { getProfileCompletion } from '../../utils/profileComplete'
import ProfilePrompt from '../ProfilePrompt'
import BrandIcon from '../BrandIcon'

const getCurrencySymbol = (code) => getCurrency(code || 'USD').symbol

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const URGENCY_COLORS = {
  now: '#FF3366',
  today: '#FF6B2B',
  scheduled: '#6C47FF',
  flexible: '#A09DC8'
}

// Create custom pin with profile photo
const createProfilePin = (avatarUrl, initial, color, urgency) => {
  const isNow = urgency === 'now'
  const pulseRing = isNow ? `
    <div style="
      position:absolute;
      inset:-8px;
      border-radius:50%;
      border:2px solid ${color};
      opacity:0.6;
      animation:pinpulse 1.5s ease-out infinite;
    "></div>
    <div style="
      position:absolute;
      inset:-16px;
      border-radius:50%;
      border:2px solid ${color};
      opacity:0.3;
      animation:pinpulse 1.5s ease-out infinite 0.4s;
    "></div>
  ` : ''

  const avatar = avatarUrl
    ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
    : `<span style="font-size:16px;font-weight:800;color:${color};">${initial}</span>`

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="position:relative;">
          ${pulseRing}
          <div style="
            width:44px;height:44px;
            border-radius:50%;
            background:#fff;
            border:3px solid ${color};
            box-shadow:0 4px 20px ${color}66;
            display:flex;align-items:center;
            justify-content:center;
            overflow:hidden;
            position:relative;z-index:2;
          ">${avatar}</div>
        </div>
        <div style="
          width:0;height:0;
          border-left:7px solid transparent;
          border-right:7px solid transparent;
          border-top:10px solid ${color};
          margin-top:-2px;
        "></div>
      </div>
      <style>
        @keyframes pinpulse {
          0% { transform:scale(1);opacity:0.6; }
          100% { transform:scale(2);opacity:0; }
        }
      </style>
    `,
    iconSize: [44, 58],
    iconAnchor: [22, 58],
    popupAnchor: [0, -60],
  })
}

// User location pin
const createUserPin = () => L.divIcon({
  className: '',
  html: `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;">
      <div style="
        position:absolute;
        width:40px;height:40px;
        border-radius:50%;
        background:rgba(108,71,255,0.2);
        animation:userpulse 2s ease-out infinite;
      "></div>
      <div style="
        width:16px;height:16px;
        border-radius:50%;
        background:#6C47FF;
        border:3px solid #fff;
        box-shadow:0 0 16px rgba(108,71,255,0.8);
        position:relative;z-index:2;
      "></div>
    </div>
    <style>
      @keyframes userpulse {
        0% { transform:scale(1);opacity:0.6; }
        100% { transform:scale(2.5);opacity:0; }
      }
    </style>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

const SetView = ({ coords }) => {
  const map = useMap()
  useEffect(() => {
    if (coords) map.setView(coords, 13)
  }, [coords])
  return null
}

export default function MapScreen() {
  const { user, profile } = useAuth()
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const [gigs, setGigs] = useState([])
  const [userPos, setUserPos] = useState([6.5244, 3.3792])
  const [liveCount, setLiveCount] = useState(312)
  const [nowCount, setNowCount] = useState(17)
  const [selectedGig, setSelectedGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [savedGigIds, setSavedGigIds] = useState(new Set())
  const [saveNotice, setSaveNotice] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [sharingGig, setSharingGig] = useState(null)
  const mapRef = useRef(null)

  useEffect(() => {
    const getLocation = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          // Request native Android permission
          const permission = await Geolocation.requestPermissions()
          console.log('Location permission:', permission)

          if (permission.location === 'granted') {
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 10000
            })
            setUserPos([pos.coords.latitude, pos.coords.longitude])

            // Watch position
            Geolocation.watchPosition(
              { enableHighAccuracy: true },
              (position) => {
                if (position) {
                  setUserPos([
                    position.coords.latitude,
                    position.coords.longitude
                  ])
                }
              }
            )
          }
        } else {
          // Web browser
          navigator.geolocation.getCurrentPosition(
            (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
            () => setUserPos([6.5244, 3.3792]),
            { enableHighAccuracy: true, timeout: 10000 }
          )
        }
      } catch (e) {
        console.log('Location error:', e)
        setUserPos([6.5244, 3.3792])
      }
    }
    getLocation()
  }, [])

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

  const cleanExpiredGigs = async () => {
    await supabase
      .from('gigs')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .eq('status', 'open')
  }

  useEffect(() => {
    fetchGigs()
    fetchSavedIds()
    cleanExpiredGigs()
    const channel = supabase
      .channel('map-gigs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gigs'
      }, () => {
        fetchGigs()
        playMapPing()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'gigs'
      }, () => fetchGigs())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'gigs'
      }, () => fetchGigs())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const fetchGigs = async () => {
    const { data, error } = await supabase
      .from('gigs')
      .select('*, poster:users!gigs_poster_id_fkey(full_name, avatar_url, trust_score, rating, gigs_completed, phone)')
      .eq('status', 'open')
      .eq('type', 'physical')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
    if (error) console.log('Map fetch error:', error.message)
    if (data) setGigs(data)
  }

  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(c => c + (Math.random() > 0.6 ? Math.round(Math.random() * 4 - 2) : 0))
      setNowCount(c => Math.max(8, c + (Math.random() > 0.75 ? Math.round(Math.random() * 3 - 1) : 0)))
    }, 1800)
    return () => clearInterval(t)
  }, [])

  const filteredGigs = gigs.filter(g => {
    if (categoryFilter === 'All') return true
    const cat = CATEGORIES.find(c => c.group === categoryFilter)
    return cat ? cat.fields.includes(g.field) : true
  })

  const nowGigs = filteredGigs.filter(g => g.urgency === 'now')

  return (
    <div style={{
      position: 'relative', height: '100%',
      display: 'flex', flexDirection: 'column'
    }}>

      {/* Map Container */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={[6.5244, 3.3792]}
          zoom={15}
          maxZoom={19}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
          <SetView coords={userPos} />

          {/* User location marker */}
          <Marker position={userPos} icon={createUserPin()} />

          {/* Gig pins */}
          {filteredGigs.map(gig => {
            const pinColor = gig.urgency === 'now' ? '#FF3366' : gig.urgency === 'today' ? '#FF6B2B' : '#6C47FF'
            const gigIcon = L.divIcon({
              className: 'custom-gig-pin',
              html: `
                <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
                  <div style="
                    width:44px;height:44px;border-radius:50%;
                    border:3px solid ${pinColor};
                    overflow:hidden;background:#EEE9FF;
                    box-shadow:0 4px 12px rgba(0,0,0,0.25);
                    display:flex;align-items:center;justify-content:center;
                    font-size:16px;font-weight:800;color:#6C47FF;
                  ">
                    ${gig.poster?.avatar_url
                      ? `<img src="${gig.poster.avatar_url}" style="width:100%;height:100%;object-fit:cover"/>`
                      : gig.poster?.full_name?.charAt(0) || '?'
                    }
                  </div>
                  ${gig.urgency === 'now' ? `
                    <div style="
                      position:absolute;top:-3px;right:-3px;
                      width:12px;height:12px;
                      background:#FF3366;border-radius:50%;
                      border:2px solid white;
                      animation:pinpulse 1s infinite;
                    "></div>
                  ` : ''}
                  <div style="
                    background:white;border-radius:8px;
                    padding:3px 7px;font-size:10px;font-weight:700;
                    color:#14123A;box-shadow:0 2px 8px rgba(0,0,0,0.15);
                    margin-top:3px;white-space:nowrap;
                    max-width:120px;overflow:hidden;text-overflow:ellipsis;
                    font-family:'Plus Jakarta Sans',sans-serif;
                  ">
                    ${gig.street
                      ? `📍 ${gig.street}`
                      : gig.location
                        ? `📍 ${gig.location}`
                        : gig.title?.substring(0, 20)}
                  </div>
                </div>
              `,
              iconSize: [44, 66],
              iconAnchor: [22, 66],
              popupAnchor: [0, -66]
            })

            return (
              <Marker
                key={gig.id}
                position={[gig.latitude, gig.longitude]}
                icon={gigIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedGig(gig)
                    setApplied(false)
                  }
                }}
              >
                <Popup>
                  <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: '200px' }}>
                    {(gig.house_number || gig.street || gig.landmark) && (
                      <div style={{
                        background: '#F5F4FF', borderRadius: '8px',
                        padding: '8px 10px', marginBottom: '8px',
                        fontSize: '11px', color: '#5B5887'
                      }}>
                        {gig.house_number && <div>🏠 {gig.house_number}</div>}
                        {gig.street && <div>🛣️ {gig.street}</div>}
                        {gig.landmark && <div>📍 Near {gig.landmark}</div>}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A', marginBottom: '4px' }}>
                      {gig.title}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#00C48C', marginBottom: '6px' }}>
                      {getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}
                    </div>
                    <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                      Posted by {gig.poster?.full_name}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Live Stats Overlay — Top Left */}
        <div style={{
          position: 'absolute', top: '14px', left: '14px',
          display: 'flex', gap: '8px', zIndex: 400
        }}>
          <div style={{
            background: 'rgba(13,27,62,0.88)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px', padding: '6px 13px',
            display: 'flex', alignItems: 'center', gap: '6px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: '#FF3366', animation: 'blink 0.9s infinite'
            }} />
            <span style={{
              fontSize: '11px', fontWeight: '700', color: '#fff'
            }}>{nowCount} NOW</span>
          </div>
          <div style={{
            background: 'rgba(13,27,62,0.88)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px', padding: '6px 13px',
            display: 'flex', alignItems: 'center', gap: '6px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: '#00C48C'
            }} />
            <span style={{
              fontSize: '11px', fontWeight: '700', color: '#fff'
            }}>{liveCount} live</span>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div style={{
          position: 'absolute', top: '52px', left: '14px',
          right: '14px', zIndex: 10,
          display: 'flex', gap: '7px',
          overflowX: 'auto', scrollbarWidth: 'none',
          pointerEvents: 'all'
        }}>
          <button
            onClick={() => setCategoryFilter('All')}
            style={{
              background: categoryFilter === 'All'
                ? 'rgba(108,71,255,0.95)' : 'rgba(13,27,62,0.82)',
              backdropFilter: 'blur(8px)',
              border: `1.5px solid ${categoryFilter === 'All' ? '#9B59FF' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '20px', padding: '5px 13px',
              fontSize: '11px', fontWeight: '700',
              color: '#fff', cursor: 'pointer',
              whiteSpace: 'nowrap', fontFamily: 'inherit'
            }}>✦ All</button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.group}
              onClick={() => setCategoryFilter(
                categoryFilter === cat.group ? 'All' : cat.group
              )}
              style={{
                background: categoryFilter === cat.group
                  ? cat.color + 'CC' : 'rgba(13,27,62,0.82)',
                backdropFilter: 'blur(8px)',
                border: `1.5px solid ${categoryFilter === cat.group ? cat.color : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '20px', padding: '5px 13px',
                fontSize: '11px', fontWeight: '700',
                color: '#fff', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit',
                transition: 'all 0.15s'
              }}>
              {cat.icon} {cat.group}
            </button>
          ))}
        </div>

        {/* Legend — Bottom Right */}
        <div style={{
          position: 'absolute', bottom: '14px', right: '14px',
          display: 'flex', flexDirection: 'column',
          gap: '5px', zIndex: 400
        }}>
          {[
            ['#FF3366', 'Urgent NOW'],
            ['#FF6B2B', 'Today'],
            ['#00C48C', 'Worker live'],
            ['#6C47FF', 'You'],
          ].map(([color, label]) => (
            <div key={label} style={{
              background: 'rgba(13,27,62,0.88)',
              backdropFilter: 'blur(6px)',
              borderRadius: '7px', padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: '6px',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: color, flexShrink: 0
              }} />
              <span style={{
                fontSize: '10px', color: 'rgba(255,255,255,0.85)',
                fontWeight: '600'
              }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Happening Now Strip */}
      <div style={{
        background: '#fff',
        borderTop: '1.5px solid #E2E0FF',
        flexShrink: 0
      }}>
        <div style={{
          padding: '12px 16px 8px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{
            fontSize: '11px', fontWeight: '700',
            color: '#A09DC8', letterSpacing: '1px'
          }}>HAPPENING NOW</span>
          <span style={{
            fontSize: '11px', color: '#6C47FF',
            fontWeight: '600', cursor: 'pointer'
          }}>See all →</span>
        </div>

        {filteredGigs.length === 0 ? (
          <div style={{
            padding: '12px 16px 16px',
            textAlign: 'center',
            color: '#A09DC8', fontSize: '13px'
          }}>
            {gigs.length === 0
              ? 'No live gigs yet — be the first to post one! 🚀'
              : 'No gigs in this category nearby'}
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: '12px',
            overflowX: 'auto', padding: '0 16px 16px',
            scrollbarWidth: 'none'
          }}>
            {filteredGigs.slice(0, 8).map(gig => (
              <div key={gig.id}
                onClick={() => { setSelectedGig(gig); setApplied(false) }}
                style={{
                  background: '#F5F4FF',
                  borderRadius: '14px', padding: '12px 14px',
                  minWidth: '190px', border: '1.5px solid #E2E0FF',
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#B8A5FF'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#E2E0FF'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: '6px'
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    background: gig.urgency === 'now' ? '#FFE8EE' : '#FFF0E8',
                    border: `1px solid ${gig.urgency === 'now' ? '#FF99B3' : '#FFBC99'}`,
                    borderRadius: '4px', padding: '2px 6px',
                    fontSize: '8px', fontWeight: '800',
                    color: gig.urgency === 'now' ? '#FF3366' : '#FF6B2B',
                    letterSpacing: '0.8px'
                  }}>
                    {gig.urgency === 'now' && (
                      <span style={{
                        width: '4px', height: '4px', borderRadius: '50%',
                        background: '#FF3366', display: 'inline-block',
                        animation: 'blink 0.9s infinite'
                      }} />
                    )}
                    {gig.urgency?.toUpperCase()}
                  </span>
                  {gig.location && (
                    <span style={{ fontSize: '9px', color: '#FF6B2B' }}>
                      📍
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: '#14123A', marginBottom: '5px', lineHeight: '1.3'
                }}>{gig.title}</div>
                <div style={{
                  fontSize: '14px', fontWeight: '800', color: '#00C48C'
                }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GIG DETAIL SHEET */}
      {selectedGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 500,
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
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', position: 'relative',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '40px', height: '4px',
                background: '#E2E0FF', borderRadius: '2px'
              }} />
              <button
                onClick={() => { setSelectedGig(null); setApplied(false) }}
                style={{
                  position: 'absolute', right: 0,
                  width: '32px', height: '32px',
                  background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                  borderRadius: '50%', fontSize: '16px',
                  color: '#8B8FAF', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', lineHeight: 1
                }}>×</button>
            </div>

            {applied ? (
              <div style={{ padding: '20px 0' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div style={{ fontSize: '52px', marginBottom: '12px' }}>🎯</div>
                  <div style={{
                    fontSize: '22px', fontWeight: '800',
                    color: '#6C47FF', marginBottom: '8px'
                  }}>Application Sent!</div>
                  <div style={{
                    fontSize: '13px', color: '#8B8FAF',
                    lineHeight: '1.6', marginBottom: '20px'
                  }}>
                    The client will review and confirm your application.
                    Once accepted you'll see the exact address.
                  </div>
                </div>

                {/* Exact address revealed after apply */}
                {(selectedGig.house_number || selectedGig.street || selectedGig.landmark) && (
                  <div style={{
                    background: 'linear-gradient(135deg, #EEE9FF, #F8F5FF)',
                    border: '1.5px solid #B8A5FF',
                    borderRadius: '16px', padding: '16px', marginBottom: '16px'
                  }}>
                    <div style={{
                      display: 'flex', gap: '8px', alignItems: 'center',
                      marginBottom: '12px'
                    }}>
                      <span style={{ fontSize: '18px' }}>📍</span>
                      <div style={{
                        fontSize: '12px', fontWeight: '700', color: '#6C47FF',
                        textTransform: 'uppercase', letterSpacing: '0.8px'
                      }}>Exact Address</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedGig.house_number && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: '#A09DC8',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Building</span>
                          <span style={{
                            fontSize: '13px', fontWeight: '600', color: '#14123A'
                          }}>{selectedGig.house_number}</span>
                        </div>
                      )}
                      {selectedGig.street && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: '#A09DC8',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Street</span>
                          <span style={{
                            fontSize: '13px', fontWeight: '600', color: '#14123A'
                          }}>{selectedGig.street}</span>
                        </div>
                      )}
                      {selectedGig.landmark && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: '#A09DC8',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Landmark</span>
                          <span style={{
                            fontSize: '13px', fontWeight: '600', color: '#14123A'
                          }}>{selectedGig.landmark}</span>
                        </div>
                      )}
                      {selectedGig.directions && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: '#A09DC8',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Directions</span>
                          <span style={{
                            fontSize: '13px', color: '#5B5887', lineHeight: '1.5'
                          }}>{selectedGig.directions}</span>
                        </div>
                      )}
                    </div>

                    {selectedGig.latitude && selectedGig.longitude && (
                      <a
                        href={`https://www.google.com/maps?q=${selectedGig.latitude},${selectedGig.longitude}`}
                        target="_blank" rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '8px',
                          marginTop: '14px',
                          background: '#fff', border: '1.5px solid #B8A5FF',
                          borderRadius: '10px', padding: '10px',
                          fontSize: '13px', fontWeight: '700',
                          color: '#6C47FF', textDecoration: 'none'
                        }}>
                        🗺 Open in Google Maps
                      </a>
                    )}
                  </div>
                )}

                {/* WhatsApp button */}
                {selectedGig.poster?.phone && (
                  <a
                    href={`https://wa.me/${selectedGig.poster.phone.replace(/\D/g, '')}?text=Hi, I just applied for your gig "${selectedGig.title}" on Prima`}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      background: '#25D366', border: 'none',
                      borderRadius: '12px', padding: '14px',
                      fontSize: '14px', fontWeight: '700',
                      color: '#fff', textDecoration: 'none',
                      width: '100%', boxSizing: 'border-box'
                    }}>
                    💬 Message on WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <>
                {/* Poster Info */}
                <div style={{
                  display: 'flex', gap: '12px',
                  alignItems: 'center', marginBottom: '16px'
                }}>
                  <div
                    onClick={() => setViewingProfile(selectedGig.poster_id)}
                    style={{
                    width: '52px', height: '52px', borderRadius: '14px',
                    background: '#EEE9FF', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px', fontWeight: '800',
                    color: '#6C47FF', overflow: 'hidden', flexShrink: 0,
                    cursor: 'pointer'
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
                      fontSize: '14px', fontWeight: '700', color: '#14123A',
                      cursor: 'pointer'
                    }}>
                      {selectedGig.poster?.full_name || 'Anonymous'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                      ⭐ {selectedGig.poster?.rating || 5.0} ·{' '}
                      {selectedGig.poster?.gigs_completed || 0} gigs ·{' '}
                      Trust {selectedGig.poster?.trust_score || 100}%
                    </div>
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    background: URGENCY_COLORS[selectedGig.urgency] + '18',
                    border: `1px solid ${URGENCY_COLORS[selectedGig.urgency]}44`,
                    borderRadius: '6px', padding: '4px 10px',
                    fontSize: '10px', fontWeight: '800',
                    color: URGENCY_COLORS[selectedGig.urgency], letterSpacing: '0.8px'
                  }}>
                    {selectedGig.urgency === 'now' && (
                      <span style={{
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: URGENCY_COLORS[selectedGig.urgency],
                        display: 'inline-block', animation: 'blink 0.9s infinite'
                      }} />
                    )}
                    {selectedGig.urgency?.toUpperCase()}
                  </div>
                </div>

                {/* Title */}
                <h2 style={{
                  fontSize: '20px', fontWeight: '800',
                  color: '#14123A', lineHeight: '1.3', marginBottom: '16px'
                }}>{selectedGig.title}</h2>

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
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '4px'
                    }}>Pay Range</div>
                    <div style={{
                      fontSize: '24px', fontWeight: '800',
                      color: '#00C48C', letterSpacing: '-0.5px'
                    }}>{getCurrencySymbol(selectedGig.currency)}{selectedGig.pay_min}</div>
                    <div style={{ fontSize: '11px', color: '#00C48C', opacity: 0.7 }}>
                      up to {getCurrencySymbol(selectedGig.currency)}{selectedGig.pay_max}
                    </div>
                  </div>
                  <div style={{
                    background: '#FFF0E8', border: '1.5px solid #FFBC99',
                    borderRadius: '14px', padding: '14px'
                  }}>
                    <div style={{
                      fontSize: '9px', color: '#FF6B2B', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '4px'
                    }}>Location</div>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: '#14123A', lineHeight: '1.3'
                    }}>{selectedGig.location || 'Remote'}</div>
                    {selectedGig.latitude && (
                      <div style={{ fontSize: '10px', color: '#FF6B2B', marginTop: '2px' }}>
                        📍 On map
                      </div>
                    )}
                  </div>
                </div>

                {/* Full address — visible before applying */}
                {(selectedGig.house_number || selectedGig.street) && (
                  <div style={{
                    background: '#FFF8F0', border: '1.5px solid #FFBC99',
                    borderRadius: '14px', padding: '14px', marginBottom: '14px',
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>🏠</span>
                    <div>
                      <div style={{
                        fontSize: '9px', fontWeight: '700', color: '#FF6B2B',
                        textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                      }}>Address</div>
                      {selectedGig.house_number && (
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A' }}>
                          {selectedGig.house_number}
                        </div>
                      )}
                      {selectedGig.street && (
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#5B5887' }}>
                          {selectedGig.street}
                        </div>
                      )}
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

                {/* Receipt protection notice */}
                <div style={{
                  background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                  borderRadius: '12px', padding: '14px',
                  display: 'flex', gap: '10px', marginBottom: '20px'
                }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>🔒</span>
                  <div style={{ fontSize: '12px', color: '#6C47FF', lineHeight: '1.6' }}>
                    Both parties confirm completion by uploading receipts with their names. Direct and protected.
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setSharingGig(selectedGig)}
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
                    <span>🔗</span> Share & Earn Credits
                  </button>
                  <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={(e) => toggleSave(e, selectedGig.id)}
                    style={{
                      background: savedGigIds.has(selectedGig?.id) ? '#EEE9FF' : '#F5F4FF',
                      border: `1.5px solid ${savedGigIds.has(selectedGig?.id) ? '#B8A5FF' : '#E2E0FF'}`,
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
                    flex: 1, background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '600',
                    color: '#8B8FAF', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>Skip</button>
                  <button
                    onClick={async () => {
  // Selfie verification check
  const { data: userProfile } = await supabase
    .from('users')
    .select('selfie_verified')
    .eq('id', user.id)
    .single()
  if (!userProfile?.selfie_verified) {
    alert('Please complete selfie verification in your profile before applying for gigs.')
    window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
    return
  }
  // Profile completion check
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
    setApplied(true)
    await trackGigReferral(selectedGig.id, userId)
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
          background: '#14123A',
          color: '#fff',
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
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 14px !important;
          box-shadow: 0 8px 32px rgba(108,71,255,0.15) !important;
          border: 1.5px solid #E2E0FF !important;
        }
        .leaflet-popup-tip {
          background: #fff !important;
        }
        .leaflet-container {
          font-family: 'Plus Jakarta Sans', sans-serif !important;
        }
        /* Force Leaflet below all modals */
        .leaflet-pane,
        .leaflet-tile,
        .leaflet-marker-icon,
        .leaflet-marker-shadow,
        .leaflet-tile-pane,
        .leaflet-overlay-pane,
        .leaflet-shadow-pane,
        .leaflet-marker-pane,
        .leaflet-tooltip-pane,
        .leaflet-popup-pane {
          z-index: 1 !important;
        }
        .leaflet-top,
        .leaflet-bottom {
          z-index: 2 !important;
        }
      `}</style>
    </div>
  )
}
