import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../supabase'
import { showToast } from '../../utils/toast'
import PublicProfile from '../PublicProfile'
import { playMapPing } from '../../utils/sounds'
import { useAuth } from '../../context/AuthContext'
import { getCurrency } from '../../data/currencies'
import { parseTimestamp } from '../../utils/time'
import { CATEGORIES } from '../../data/categories'
import ShareGig from '../ShareGig'
import ReportModal from '../ReportModal'
import { getProfileCompletion } from '../../utils/profileComplete'
import ProfilePrompt from '../ProfilePrompt'
import BrandIcon from '../BrandIcon'
import { applyToGig } from '../../utils/gigApplications'
import PrimaBasemap from '../maps/PrimaBasemap'

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

const calcDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
const formatDist = (km) => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`

const ExpiryBadge = ({ expiresAt }) => {
  if (!expiresAt) return null
  const remaining = timeUntil(expiresAt)
  if (!remaining) return null
  const isUrgent = parseTimestamp(expiresAt) - Date.now() < 24 * 60 * 60 * 1000
  const isWarning = parseTimestamp(expiresAt) - Date.now() < 3 * 24 * 60 * 60 * 1000
  const color = isUrgent ? '#FF3366' : isWarning ? '#FF6B2B' : '#A09DC8'
  const bg = isUrgent ? '#FFE8EE' : isWarning ? '#FFF0E8' : '#F5F4FF'
  const border = isUrgent ? '#FF99B3' : isWarning ? '#FFBC99' : '#E2E0FF'
  return (
    <span style={{
      fontSize: '11px', fontWeight: '700', color,
      background: bg, border: `1px solid ${border}`,
      borderRadius: '6px', padding: '2px 8px',
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      whiteSpace: 'nowrap',
    }}>{remaining} left</span>
  )
}

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

  const avatar = avatarUrl
    ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
    : `<span style="font-size:16px;font-weight:800;color:${color};">${initial}</span>`

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="position:relative;">
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
    `,
    iconSize: [44, 58],
    iconAnchor: [22, 58],
    popupAnchor: [0, -60],
  })
}

// User location pin
const createUserPin = () => L.divIcon({
  className: 'prima-user-location',
  html: `
    <div class="prima-user-pin">
      <div class="prima-user-accuracy"></div>
      <div class="prima-user-core"></div>
    </div>
  `,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
})

// Zoom-aware clustering — groups pins that are too close at the current zoom level
const ClusterLayer = ({ gigs, onSelect, selectedGigId }) => {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: e => setZoom(e.target.getZoom()) })

  const clusters = useMemo(() => {
    const precision = Math.max(1, Math.min(4, zoom - 11))
    const groups = {}
    gigs.forEach(gig => {
      const lat = parseFloat(gig.latitude)
      const lng = parseFloat(gig.longitude)
      const key = `${lat.toFixed(precision)},${lng.toFixed(precision)}`
      if (!groups[key]) groups[key] = { gigs: [], sumLat: 0, sumLng: 0 }
      groups[key].gigs.push(gig)
      groups[key].sumLat += lat
      groups[key].sumLng += lng
    })
    return Object.values(groups).map(g => ({
      ...g,
      lat: g.sumLat / g.gigs.length,
      lng: g.sumLng / g.gigs.length
    }))
  }, [gigs, zoom])

  return clusters.map((cluster, i) => {
    if (cluster.gigs.length === 1) {
      const gig = cluster.gigs[0]
      const isDigital = gig.type === 'digital'
      const pinColor = isDigital ? '#0EA5E9'
        : gig.urgency === 'now' ? '#FF3366'
        : gig.urgency === 'today' ? '#FF6B2B' : '#6C47FF'
      const pinBg = isDigital ? '#E0F2FE' : '#EEE9FF'
      const isUrgent = gig.urgency === 'now' || gig.urgency === 'today'
      const isSelected = selectedGigId === gig.id
      const gigIcon = L.divIcon({
        className: 'custom-gig-pin',
        html: `
          <div class="prima-gig-pin ${isSelected ? 'is-selected' : ''}" style="--pin-color:${pinColor};">
            <div class="prima-gig-avatar" style="border-color:${pinColor};background:${pinBg};color:${pinColor};">
              ${gig.poster?.avatar_url ? `<img src="${gig.poster.avatar_url}" style="width:100%;height:100%;object-fit:cover"/>` : gig.poster?.full_name?.charAt(0) || '?'}
            </div>
            ${isDigital ? `<div style="position:absolute;top:-4px;right:-4px;background:#0EA5E9;border-radius:6px;padding:1px 4px;font-size:8px;font-weight:800;color:#fff;border:1.5px solid #fff;">WEB</div>` : ''}
            <div class="prima-gig-label">
              ${isDigital ? `Remote · ${gig.title?.substring(0, 14) || 'Digital'}` : gig.street ? gig.street : gig.location ? gig.location.split(',')[0] : gig.title?.substring(0, 20)}
            </div>
          </div>
        `,
        iconSize: [44, 66], iconAnchor: [22, 66], popupAnchor: [0, -66]
      })
      return (
        <Marker key={gig.id} position={[gig.latitude, gig.longitude]} icon={gigIcon}
          zIndexOffset={isSelected ? 1200 : isUrgent ? 800 : 400}
          eventHandlers={{ click: () => onSelect(gig) }} />
      )
    }

    const clusterIcon = L.divIcon({
      className: 'prima-cluster-marker',
      html: `
        <div class="prima-cluster-pin">
          <div class="prima-cluster-core">${cluster.gigs.length}</div>
        </div>
      `,
      iconSize: [58, 58], iconAnchor: [29, 29]
    })
    return (
      <Marker key={`cluster-${i}`} position={[cluster.lat, cluster.lng]} icon={clusterIcon}
        zIndexOffset={300}
        eventHandlers={{ click: () => map.flyTo([cluster.lat, cluster.lng], zoom + 2, { animate: true, duration: 0.5 }) }} />
    )
  })
}

const SetView = ({ coords }) => {
  const map = useMap()
  useEffect(() => {
    if (coords) map.setView(coords, 13)
  }, [coords])
  return null
}

const FlyToGig = ({ coords }) => {
  const map = useMap()
  useEffect(() => {
    if (coords) map.flyTo(coords, 17, { animate: true, duration: 1.1, easeLinearity: 0.22 })
  }, [coords, map])
  return null
}

const MapReady = ({ onReady }) => {
  const map = useMap()
  useEffect(() => {
    map.whenReady(onReady)
  }, [map, onReady])
  return null
}

const MapBoundsTracker = ({ onBoundsChange }) => {
  const map = useMap()
  useEffect(() => { onBoundsChange(map.getBounds()) }, [])
  useMapEvents({
    moveend: (e) => onBoundsChange(e.target.getBounds()),
    zoomend: (e) => onBoundsChange(e.target.getBounds()),
  })
  return null
}

export default function MapScreen() {
  const { user, profile } = useAuth()
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const [gigs, setGigs] = useState([])
  const [userPos, setUserPos] = useState([6.5244, 3.3792])
  const [liveCount, setLiveCount] = useState(312)
  const [selectedGig, setSelectedGig] = useState(null)
  const [reportingGig, setReportingGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [savedGigIds, setSavedGigIds] = useState(new Set())
  const [saveNotice, setSaveNotice] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [sharingGig, setSharingGig] = useState(null)
  const [flyToCoords, setFlyToCoords] = useState(null)
  const [radiusKm, setRadiusKm] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [darkMap, setDarkMap] = useState(false)
  const [showAllGigs, setShowAllGigs] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef(null)
  const boundsRef = useRef(null)
  const categoryScrollRef = useRef(null)
  const categoryDragRef = useRef({ active: false, startX: 0, scrollLeft: 0 })

  useEffect(() => {
    const getLocation = async () => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
          () => setUserPos([6.5244, 3.3792]),
          { enableHighAccuracy: true, timeout: 10000 }
        )
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
      .update({ deleted_at: new Date().toISOString() })
      .lt('expires_at', new Date().toISOString())
      .eq('status', 'open')
      .is('deleted_at', null)
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
    const expireInterval = setInterval(() => fetchGigs(), 60000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(expireInterval)
    }
  }, [])

  const fetchGigs = async () => {
    const { data, error } = await supabase
      .from('gigs')
      .select('*, poster:users!gigs_poster_id_fkey(full_name, avatar_url, trust_score, rating, gigs_completed, phone)')
      .eq('status', 'open')
      .is('deleted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
    if (error) console.log('Map fetch error:', error.message)
    if (data) {
      setGigs(data.filter(gig =>
        !gig.expires_at || parseTimestamp(gig.expires_at) >= new Date()
      ))
    }
  }

  const handleBoundsChange = (bounds) => {
    boundsRef.current = bounds
  }

  const openGig = useCallback((gig, showSheet = true) => {
    if (!gig) return
    if (showSheet) {
      setSelectedGig(gig)
      setApplied(false)
    }
    if (gig.latitude && gig.longitude) {
      setFlyToCoords([Number(gig.latitude), Number(gig.longitude)])
    }
  }, [])

  const zoomMap = (delta) => {
    const map = mapRef.current
    if (!map) return
    map.flyTo(map.getCenter(), map.getZoom() + delta, {
      animate: true,
      duration: 0.35,
    })
  }

  const recenterOnUser = () => {
    const map = mapRef.current
    if (!map || !userPos) return
    map.flyTo(userPos, Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.75,
    })
  }

  const startCategoryDrag = (e) => {
    const row = categoryScrollRef.current
    if (!row) return
    categoryDragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: row.scrollLeft,
    }
    row.setPointerCapture?.(e.pointerId)
  }

  const moveCategoryDrag = (e) => {
    const row = categoryScrollRef.current
    const drag = categoryDragRef.current
    if (!row || !drag.active) return
    row.scrollLeft = drag.scrollLeft - (e.clientX - drag.startX)
  }

  const stopCategoryDrag = (e) => {
    categoryDragRef.current.active = false
    categoryScrollRef.current?.releasePointerCapture?.(e.pointerId)
  }

  const wheelCategoryRow = (e) => {
    const row = categoryScrollRef.current
    if (!row) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      row.scrollLeft += e.deltaY
    }
  }

  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(c => c + (Math.random() > 0.6 ? Math.round(Math.random() * 4 - 2) : 0))
    }, 1800)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const handleOpenGigOnMap = (e) => {
      const gig = e.detail
      if (!gig?.latitude || !gig?.longitude) return
      openGig(gig)
    }
    window.addEventListener('openGigOnMap', handleOpenGigOnMap)
    return () => window.removeEventListener('openGigOnMap', handleOpenGigOnMap)
  }, [openGig])

  const filteredGigs = gigs.filter(g => {
    if (categoryFilter !== 'All') {
      const cat = CATEGORIES.find(c => c.group === categoryFilter)
      if (cat && !cat.fields.includes(g.field)) return false
    }
    if (radiusKm) {
      const dist = calcDistance(userPos[0], userPos[1], g.latitude, g.longitude)
      if (dist > radiusKm) return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const hit = g.title?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.field?.toLowerCase().includes(q) ||
        g.location?.toLowerCase().includes(q)
      if (!hit) return false
    }
    return true
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
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          zoomControl={false}
          ref={mapRef}
        >
          <PrimaBasemap mode={darkMap ? 'dark' : 'light'} />
          <MapReady onReady={() => setMapReady(true)} />
          <SetView coords={userPos} />
          {flyToCoords && <FlyToGig coords={flyToCoords} />}
          <MapBoundsTracker onBoundsChange={handleBoundsChange} />

          {/* User location marker */}
          <Marker position={userPos} icon={createUserPin()} zIndexOffset={1000} />

          {/* Clustered gig pins */}
          <ClusterLayer
            gigs={filteredGigs}
            selectedGigId={selectedGig?.id}
            onSelect={openGig}
          />
        </MapContainer>

        {!mapReady && (
          <div className="prima-map-skeleton">
            <div className="prima-map-skeleton-panel">
              <div className="prima-shimmer prima-shimmer-wide" />
              <div className="prima-shimmer" />
              <div className="prima-shimmer prima-shimmer-short" />
            </div>
          </div>
        )}

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setDarkMap(d => !d)}
          title={darkMap ? 'Switch to light map' : 'Switch to dark map'}
          style={{
            position: 'absolute', top: '14px', right: '14px', zIndex: 40,
            background: darkMap ? 'rgba(108,71,255,0.92)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(10px)',
            border: `1.5px solid ${darkMap ? '#9B59FF' : 'rgba(108,71,255,0.2)'}`,
            borderRadius: '20px', padding: '5px 12px',
            fontSize: '11px', fontWeight: '700',
            color: darkMap ? '#fff' : '#8B8FAF',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)'
          }}>
          {darkMap ? '☀️ Light' : '🌙 Dark'}
        </button>

        {/* Live Stats Overlay */}
        <div style={{
          position: 'absolute', top: '14px', left: '14px',
          display: 'flex', gap: '8px', zIndex: 40
        }}>
          <div style={{
            background: 'rgba(13,27,62,0.88)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px', padding: '6px 13px',
            display: 'flex', alignItems: 'center', gap: '6px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <span style={{
              fontSize: '11px', fontWeight: '700', color: '#fff'
            }}>{liveCount} live</span>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div
          ref={categoryScrollRef}
          onPointerDown={startCategoryDrag}
          onPointerMove={moveCategoryDrag}
          onPointerUp={stopCategoryDrag}
          onPointerCancel={stopCategoryDrag}
          onPointerLeave={stopCategoryDrag}
          onWheel={wheelCategoryRow}
          style={{
          position: 'absolute', top: '56px', left: '14px',
          right: '14px', zIndex: 40,
          display: 'flex', gap: '10px',
          overflowX: 'auto', scrollbarWidth: 'none',
          pointerEvents: 'all',
          padding: '2px 2px 8px',
          cursor: 'grab',
          touchAction: 'pan-x'
        }}>
          <button
            onClick={() => setCategoryFilter('All')}
            style={{
              background: '#fff',
              border: `1px solid ${categoryFilter === 'All' ? '#14123A' : 'rgba(20,18,58,0.12)'}`,
              borderRadius: '999px', padding: '8px 15px',
              fontSize: '14px', fontWeight: '700',
              color: '#202124', cursor: 'pointer',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
              boxShadow: categoryFilter === 'All'
                ? '0 3px 10px rgba(20,18,58,0.24)'
                : '0 2px 7px rgba(20,18,58,0.2)',
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              lineHeight: 1,
              transform: categoryFilter === 'All' ? 'translateY(-1px)' : 'none',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease'
            }}>✦ All</button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.group}
              onClick={() => setCategoryFilter(
                categoryFilter === cat.group ? 'All' : cat.group
              )}
              style={{
                background: '#fff',
                border: `1px solid ${categoryFilter === cat.group ? '#14123A' : 'rgba(20,18,58,0.12)'}`,
                borderRadius: '999px', padding: '8px 15px',
                fontSize: '14px', fontWeight: '700',
                color: '#202124', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit',
                boxShadow: categoryFilter === cat.group
                  ? '0 3px 10px rgba(20,18,58,0.24)'
                  : '0 2px 7px rgba(20,18,58,0.2)',
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                lineHeight: 1,
                transform: categoryFilter === cat.group ? 'translateY(-1px)' : 'none',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease'
              }}>
              <span style={{ fontSize: '16px', lineHeight: 1 }}>{cat.icon}</span>
              {cat.group}
            </button>
          ))}
        </div>

        {/* Radius Filter Chips */}
        <div style={{
          position: 'absolute', top: '96px', left: '14px',
          zIndex: 40, display: 'flex', gap: '6px',
          pointerEvents: 'all'
        }}>
          {[null, 5, 10, 25].map(km => (
            <button
              key={km ?? 'all'}
              onClick={() => setRadiusKm(radiusKm === km ? null : km)}
              style={{
                background: radiusKm === km
                  ? 'rgba(0,196,140,0.9)' : 'rgba(13,27,62,0.82)',
                backdropFilter: 'blur(8px)',
                border: `1.5px solid ${radiusKm === km ? '#00C48C' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '20px', padding: '4px 11px',
                fontSize: '10px', fontWeight: '700',
                color: '#fff', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit'
              }}>
              {km ? `${km}km` : 'Any distance'}
            </button>
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
          padding: '8px 16px 5px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{
            fontSize: '11px', fontWeight: '700',
            color: '#A09DC8', letterSpacing: '1px'
          }}>HAPPENING NOW</span>
          <span
            onClick={() => setShowAllGigs(true)}
            style={{
              fontSize: '11px', color: '#6C47FF',
              fontWeight: '600', cursor: 'pointer'
            }}>See all ({filteredGigs.length}) →</span>
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
            overflowX: 'auto', padding: '0 16px 10px',
            scrollbarWidth: 'none'
          }}>
            {filteredGigs.slice(0, 8).map(gig => (
              <div key={gig.id}
                onClick={() => openGig(gig)}
                className={selectedGig?.id === gig.id ? 'prima-now-card is-active' : 'prima-now-card'}
                style={{
                  background: selectedGig?.id === gig.id ? '#EEE9FF' : '#F5F4FF',
                  borderRadius: '12px', padding: '9px 12px',
                  minWidth: '174px',
                  border: `1.5px solid ${selectedGig?.id === gig.id ? '#6C47FF' : '#E2E0FF'}`,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                  boxShadow: selectedGig?.id === gig.id
                    ? '0 8px 24px rgba(108,71,255,0.18)'
                    : '0 4px 14px rgba(20,18,58,0.06)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#B8A5FF'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = selectedGig?.id === gig.id ? '#6C47FF' : '#E2E0FF'
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
                    {gig.urgency?.toUpperCase()}
                  </span>
                  {gig.type === 'digital' ? (
                    <span style={{
                      fontSize: '8px', fontWeight: '800',
                      color: '#0EA5E9', letterSpacing: '0.5px'
                    }}>REMOTE</span>
                  ) : null}
                </div>
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: '#14123A', marginBottom: '5px', lineHeight: '1.3'
                }}>{gig.title}</div>
                <div style={{
                  fontSize: '14px', fontWeight: '800', color: '#00C48C'
                }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
                <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '4px' }}>
                  {formatDist(calcDistance(userPos[0], userPos[1], gig.latitude, gig.longitude))} away
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GIG DETAIL SHEET */}
      {selectedGig && (
        <div className="prima-sheet-backdrop" style={{
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
          <div className="prima-bottom-sheet" onClick={e => e.stopPropagation()} style={{
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
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                    <BrandIcon name="accepted" size={64} active />
                  </div>
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
                      <BrandIcon name="location" size={28} active />
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                        <button
                          onClick={() => {
                            setFlyToCoords([selectedGig.latitude, selectedGig.longitude])
                            setSelectedGig(null)
                          }}
                          style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px',
                            width: '100%',
                            background: '#fff', border: '1.5px solid #B8A5FF',
                            borderRadius: '10px', padding: '10px',
                            fontSize: '13px', fontWeight: '700',
                            color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
                          }}>
                          <BrandIcon name="map" size={22} active /> Show on Map
                        </button>
                      </div>
                    )}
                  </div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    background: URGENCY_COLORS[selectedGig.urgency] + '18',
    border: `1px solid ${URGENCY_COLORS[selectedGig.urgency]}44`,
    borderRadius: '6px', padding: '4px 10px',
    fontSize: '10px', fontWeight: '800',
    color: URGENCY_COLORS[selectedGig.urgency], letterSpacing: '0.8px'
  }}>
    {selectedGig.urgency?.toUpperCase()}
  </div>
  {selectedGig.slots > 1 && (
    <span style={{
      background: '#DFFDF4', border: '1px solid #7EECD2',
      borderRadius: '6px', padding: '3px 9px',
      fontSize: '9px', fontWeight: '700', color: '#00C48C', whiteSpace: 'nowrap'
    }}>{selectedGig.slots} OPEN SLOTS</span>
  )}
</div>
                </div>

                {/* Title */}
                <h2 style={{
                  fontSize: '20px', fontWeight: '800',
                  color: '#14123A', lineHeight: '1.3', marginBottom: '8px'
                }}>{selectedGig.title}</h2>

                {/* Posted / Expiry timing */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <span style={{ fontSize: '11px', color: '#A09DC8' }}>
                    Posted {timeAgo(selectedGig.created_at)}
                  </span>
                  {selectedGig.expires_at
                    ? <ExpiryBadge expiresAt={selectedGig.expires_at} />
                    : <span style={{ fontSize: '11px', color: '#A09DC8' }}>· Open-ended</span>
                  }
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
                    background: selectedGig.type === 'digital' ? '#E0F2FE' : '#FFF0E8',
                    border: `1.5px solid ${selectedGig.type === 'digital' ? '#7DD3FC' : '#FFBC99'}`,
                    borderRadius: '14px', padding: '14px'
                  }}>
                    <div style={{
                      fontSize: '9px',
                      color: selectedGig.type === 'digital' ? '#0EA5E9' : '#FF6B2B',
                      fontWeight: '700', textTransform: 'uppercase',
                      letterSpacing: '0.8px', marginBottom: '4px'
                    }}>{selectedGig.type === 'digital' ? 'Remote Work' : 'Location'}</div>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: '#14123A', lineHeight: '1.3'
                    }}>{selectedGig.type === 'digital' ? 'Online / Remote' : (selectedGig.location || 'See details')}</div>
                    {selectedGig.latitude && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px',
                        color: selectedGig.type === 'digital' ? '#0EA5E9' : '#FF6B2B',
                        marginTop: '4px'
                      }}>
                        <BrandIcon name="location" size={14} />
                        {selectedGig.type === 'digital'
                          ? 'Pinned on map'
                          : `${formatDist(calcDistance(userPos[0], userPos[1], selectedGig.latitude, selectedGig.longitude))} away`}
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
                    <BrandIcon name="physical" size={32} active />
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
                {selectedGig.payment_method === 'wallet' ? (
  <div style={{
    background: '#DFFDF4', border: '1.5px solid #7EECD2',
    borderRadius: '12px', padding: '14px',
    display: 'flex', gap: '10px', marginBottom: '20px'
  }}>
    <BrandIcon name="pay" size={32} />
    <div style={{
      fontSize: '12px', color: '#00A878', lineHeight: '1.6'
    }}>
      Payment is already secured in escrow. You'll receive it automatically once the work is confirmed complete — no chasing payment needed.
    </div>
  </div>
) : (
  <div style={{
    background: '#EEE9FF', border: '1.5px solid #B8A5FF',
    borderRadius: '12px', padding: '14px',
    display: 'flex', gap: '10px', marginBottom: '20px'
  }}>
    <BrandIcon name="lock" size={32} />
    <div style={{
      fontSize: '12px', color: '#6C47FF', lineHeight: '1.6'
    }}>
      Both parties confirm completion by uploading receipts with their names. No payment platform needed — direct and protected.
    </div>
  </div>
)}

                {/* Save + Share row */}
                <div style={{
                  display: 'flex', gap: '8px', marginBottom: '8px'
                }}>
                  <button
                    onClick={(e) => toggleSave(e, selectedGig.id)}
                    style={{
                      flex: 1, background: savedGigIds.has(selectedGig?.id)
                        ? '#EEE9FF' : '#F5F4FF',
                      border: `1.5px solid ${savedGigIds.has(selectedGig?.id)
                        ? '#B8A5FF' : '#E2E0FF'}`,
                      borderRadius: '12px', padding: '11px',
                      fontSize: '13px', fontWeight: '700',
                      color: savedGigIds.has(selectedGig?.id)
                        ? '#6C47FF' : '#8B8FAF',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>
                    <BrandIcon
                      name="saved"
                      size={20}
                      active={savedGigIds.has(selectedGig?.id)}
                    />
                    {savedGigIds.has(selectedGig?.id) ? ' Saved' : ' Save'}
                  </button>

                  <button
                    onClick={() => setSharingGig(selectedGig)}
                    style={{
                      flex: 1, background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF',
                      borderRadius: '12px', padding: '11px',
                      fontSize: '13px', fontWeight: '700',
                      color: '#8B8FAF', cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}>
                    <BrandIcon name="open" size={20} /> Share
                  </button>
                </div>

                <button
  onClick={() => setReportingGig(selectedGig)}
  style={{
    width: '100%',
    background: '#FFE8EE', border: '1.5px solid #FF99B3',
    borderRadius: '12px', padding: '10px',
    fontSize: '12px', fontWeight: '700',
    color: '#FF3366', cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '6px',
    marginBottom: '8px'
  }}>
  🚨 Report This Gig
</button>

                {/* Action buttons */}
                {selectedGig.poster_id === user?.id ? (
                  <div style={{
                    marginTop: '12px',
                    background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '12px',
                    padding: '13px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: '#8B8FAF',
                    textAlign: 'center'
                  }}>
                    Your gig
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  {/* Message button */}
                  <button
                    onClick={() => {
                      setSelectedGig(null)
                      window.dispatchEvent(new CustomEvent('openChatWithUser', {
                        detail: { userId: selectedGig.poster_id }
                      }))
                    }}
                    style={{
                      flex: 1, background: '#F5F4FF',
                      border: '1.5px solid #B8A5FF',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '13px', fontWeight: '700',
                      color: '#6C47FF', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px'
                    }}>
                    <BrandIcon name="chat" size={20} active /> Message
                  </button>

                  {/* Apply button */}
                  <button
                    onClick={async () => {
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
                      setApplying(true)
                      try {
                        const { data: { session } } = await supabase.auth.getSession()
                        const userId = session?.user?.id
                        if (!userId) {
                          showToast('Please log in to apply', 'error')
                          setApplying(false)
                          return
                        }
                        const result = await applyToGig({
                          gig: selectedGig,
                          workerId: userId,
                          notifyPush: false
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

                        setApplied(true)
                      } catch (e) {
                        console.log('Apply error:', e)
                        showToast('Error applying: ' + e.message, 'error')
                      }
                      setApplying(false)
                    }}
                    disabled={applying}
                    style={{
                      flex: 2,
                      background: applying
                        ? '#B8A5FF'
                        : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                      border: 'none', borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700', color: '#fff',
                      cursor: applying ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px'
                    }}>
                    {applying
                      ? 'Applying...'
                      : <><BrandIcon name="send" size={20} /> Apply Now</>}
                  </button>
                </div>
                )}
              </>
            )}

          </div>
        </div>
      )}

{showAllGigs && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(20,18,58,0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 550,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
  }} onClick={() => setShowAllGigs(false)}>
    <div onClick={e => e.stopPropagation()} style={{
      background: '#fff',
      borderRadius: '22px 22px 0 0',
      width: '100%', maxWidth: '640px',
      maxHeight: '80vh',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
    }}>
      <div style={{
        padding: '16px 20px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #F5F4FF', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '36px', height: '4px', background: '#E2E0FF', borderRadius: '2px' }} />
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: '#14123A' }}>All Nearby Gigs</div>
          <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '1px' }}>
            {filteredGigs.length} gig{filteredGigs.length !== 1 ? 's' : ''} in view
          </div>
        </div>
        <button onClick={() => setShowAllGigs(false)} style={{
          background: '#F5F4FF', border: '1.5px solid #E2E0FF',
          borderRadius: '50%', width: '32px', height: '32px',
          fontSize: '16px', color: '#8B8FAF', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit'
        }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 24px' }}>
        {filteredGigs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#A09DC8', fontSize: '13px' }}>
            No gigs match your filters
          </div>
        ) : filteredGigs.map(gig => (
          <div key={gig.id}
            onClick={() => { openGig(gig); setShowAllGigs(false) }}
            style={{
              background: '#F5F4FF', borderRadius: '14px',
              padding: '14px', marginBottom: '10px',
              border: '1.5px solid #E2E0FF', cursor: 'pointer',
              transition: 'border-color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#B8A5FF'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E0FF'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A', flex: 1, paddingRight: '10px', lineHeight: '1.3' }}>
                {gig.title}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#00C48C', flexShrink: 0 }}>
                {getCurrencySymbol(gig.currency)}{gig.pay_min}–{gig.pay_max}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                background: gig.urgency === 'now' ? '#FFE8EE' : '#FFF0E8',
                border: `1px solid ${gig.urgency === 'now' ? '#FF99B3' : '#FFBC99'}`,
                borderRadius: '4px', padding: '2px 7px',
                fontSize: '9px', fontWeight: '800',
                color: gig.urgency === 'now' ? '#FF3366' : '#FF6B2B', letterSpacing: '0.8px'
              }}>{gig.urgency?.toUpperCase()}</span>
              <span style={{ fontSize: '11px', color: '#A09DC8' }}>
                {formatDist(calcDistance(userPos[0], userPos[1], gig.latitude, gig.longitude))} away
              </span>
              {gig.type === 'digital' && (
                <span style={{ fontSize: '9px', fontWeight: '800', color: '#0EA5E9', letterSpacing: '0.5px' }}>REMOTE</span>
              )}
              {gig.field && (
                <span style={{ fontSize: '10px', color: '#8B8FAF' }}>{gig.field}</span>
              )}
            </div>
          </div>
        ))}
      </div>
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

{reportingGig && (
  <ReportModal
    reportedUserId={reportingGig.poster_id}
    reportedGigId={reportingGig.id}
    type="gig"
    name={`"${reportingGig.title}"`}
    onClose={() => setReportingGig(null)}
  />
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        .prima-map-skeleton {
          position: absolute;
          inset: 0;
          z-index: 8;
          pointer-events: none;
          background: linear-gradient(135deg, rgba(245,244,255,0.92), rgba(255,255,255,0.58));
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 112px;
        }
        .prima-map-skeleton-panel {
          width: min(82%, 420px);
          border-radius: 18px;
          background: rgba(255,255,255,0.72);
          border: 1px solid rgba(226,224,255,0.9);
          box-shadow: 0 12px 36px rgba(20,18,58,0.12);
          padding: 16px;
          overflow: hidden;
        }
        .prima-shimmer {
          height: 12px;
          border-radius: 999px;
          background: #E2E0FF;
          margin-top: 10px;
          position: relative;
          overflow: hidden;
        }
        .prima-shimmer:first-child {
          margin-top: 0;
        }
        .prima-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent);
          animation: shimmer 1.15s linear infinite;
        }
        .prima-shimmer-wide { width: 100%; }
        .prima-shimmer-short { width: 58%; }
        .prima-sheet-backdrop {
          animation: fadeIn 180ms ease-out;
        }
        .prima-bottom-sheet {
          box-shadow: 0 -18px 50px rgba(20,18,58,0.22);
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
          z-index: 0 !important;
        }
        .prima-user-pin,
        .prima-gig-pin,
        .prima-cluster-pin {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .prima-user-pin {
          width: 46px;
          height: 46px;
        }
        .prima-user-accuracy {
          position: absolute;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: rgba(66, 133, 244, 0.16);
          border: 1px solid rgba(66, 133, 244, 0.22);
        }
        .prima-user-core {
          position: relative;
          z-index: 2;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4285F4;
          border: 3px solid #fff;
          box-shadow: 0 2px 10px rgba(36, 101, 210, 0.45);
        }
        .prima-gig-pin {
          flex-direction: column;
          animation: primaPinDrop 260ms ease-out both, primaPinFloat 3.2s ease-in-out 260ms infinite;
          transform-origin: center bottom;
          transition: filter 0.18s ease;
        }
        .custom-gig-pin:hover .prima-gig-pin,
        .prima-gig-pin.is-selected {
          filter: drop-shadow(0 8px 14px rgba(108,71,255,0.25));
        }
        .prima-gig-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3px solid;
          overflow: hidden;
          box-shadow: 0 5px 14px rgba(20, 18, 58, 0.24);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          position: relative;
          z-index: 2;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .custom-gig-pin:hover .prima-gig-avatar {
          transform: scale(1.05);
        }
        .prima-gig-pin.is-selected .prima-gig-avatar {
          transform: scale(1.08);
          box-shadow: 0 8px 22px rgba(108,71,255,0.32);
        }
        .prima-gig-pin.is-selected .prima-gig-label {
          color: #6C47FF;
        }
        .prima-gig-label {
          background: rgba(255, 255, 255, 0.96);
          border-radius: 8px;
          padding: 3px 7px;
          font-size: 10px;
          font-weight: 700;
          color: #14123A;
          box-shadow: 0 2px 8px rgba(20, 18, 58, 0.14);
          margin-top: 3px;
          white-space: nowrap;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .prima-cluster-pin {
          width: 58px;
          height: 58px;
          animation: primaPinDrop 260ms ease-out both;
        }
        .prima-cluster-core {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #6C47FF;
          border: 3px solid #fff;
          box-shadow: 0 5px 16px rgba(108, 71, 255, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          font-weight: 800;
          color: #fff;
          position: relative;
          z-index: 2;
          transition: transform 0.18s ease;
        }
        .prima-cluster-marker:hover .prima-cluster-core {
          transform: scale(1.08);
        }
        .prima-now-card.is-active {
          animation: primaActiveCard 1.9s ease-in-out infinite;
        }
        @keyframes primaPinDrop {
          0% { transform: translateY(-10px) scale(0.86); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes primaPinFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes primaActiveCard {
          0%, 100% { box-shadow: 0 8px 24px rgba(108,71,255,0.18); }
          50% { box-shadow: 0 10px 30px rgba(108,71,255,0.28); }
        }
        .leaflet-tile-pane { z-index: 1 !important; }
        .leaflet-overlay-pane { z-index: 2 !important; }
        .leaflet-shadow-pane { z-index: 3 !important; }
        .leaflet-marker-pane { z-index: 4 !important; }
        .leaflet-tooltip-pane { z-index: 5 !important; }
        .leaflet-popup-pane { z-index: 6 !important; }
        .leaflet-top,
        .leaflet-bottom {
          z-index: 7 !important;
        }
      `}</style>
    </div>
  )
}
