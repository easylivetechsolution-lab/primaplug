import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { MapContainer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Building2, MapPin } from 'lucide-react'
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
import CategoryIcon from '../CategoryIcon'

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
  const color = isUrgent ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-text-subtle)'
  const bg = isUrgent ? 'var(--color-danger-soft)' : isWarning ? 'var(--color-warning-soft)' : 'var(--color-page)'
  const border = isUrgent ? 'var(--color-danger-border)' : isWarning ? 'var(--color-warning-border)' : 'var(--color-border)'
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
  now: 'var(--color-danger)',
  today: 'var(--color-warning)',
  scheduled: 'var(--color-brand)',
  flexible: 'var(--color-text-subtle)'
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

// Zoom-aware clustering groups pins that are too close at the current zoom level
const ClusterLayer = ({ gigs, onSelect, selectedGigId }) => {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  const hoverCloseTimer = useRef(null)
  const clearHoverClose = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = null
  }
  const schedulePopupClose = (popup) => {
    clearHoverClose()
    hoverCloseTimer.current = setTimeout(() => {
      const popupElement = popup?.getElement?.()
      if (!popupElement?.matches(':hover')) popup?.close?.()
    }, 220)
  }
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
      const isUrgent = gig.urgency === 'now' || gig.urgency === 'today'
      const isSelected = selectedGigId === gig.id
      const gigIcon = L.divIcon({
        className: 'custom-gig-pin',
        html: `
          <div class="prima-gig-pin ${isSelected ? 'is-selected' : ''}">
            <div class="prima-gig-avatar">
              <div class="prima-gig-avatar-inner">
                ${gig.poster?.avatar_url ? `<img src="${gig.poster.avatar_url}" alt=""/>` : `<span>${gig.poster?.full_name?.charAt(0) || '?'}</span>`}
              </div>
            </div>
            <span class="prima-gig-location-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
            </span>
            ${isDigital ? `<div style="position:absolute;top:-4px;right:-4px;background:var(--color-info);border-radius:6px;padding:1px 4px;font-size:8px;font-weight:800;color:#fff;border:1.5px solid #fff;">WEB</div>` : ''}
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
          eventHandlers={{
            mouseover: (event) => {
              clearHoverClose()
              event.target.openPopup()
            },
            mouseout: (event) => schedulePopupClose(event.target.getPopup()),
            click: (event) => {
              onSelect(gig)
              setTimeout(() => event.target.closePopup(), 0)
            }
          }}>
          <Popup className="prima-work-popup" minWidth={230} maxWidth={280}
            closeButton={false} autoPan={false}
            eventHandlers={{
              mouseover: clearHoverClose,
              mouseout: (event) => schedulePopupClose(event.target)
            }}>
            <div className="prima-map-work-card">
              {(gig.street || gig.location) && (
                <div className="prima-map-work-address">
                  {gig.street && (
                    <div className="prima-map-work-address-row">
                      <Building2 size={14} strokeWidth={1.8} />
                      <span>{gig.street}</span>
                    </div>
                  )}
                  {gig.location && (
                    <div className="prima-map-work-address-row">
                      <MapPin size={14} strokeWidth={1.8} />
                      <span>{gig.location.split(',').slice(0, 2).join(',').trim()}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="prima-map-work-title">{gig.title}</div>
              <div className="prima-map-work-pay">
                {gig.pay_min != null ? `${getCurrencySymbol(gig.currency)}${gig.pay_min}` : 'Pay negotiable'}
                {gig.pay_max != null ? `–${getCurrencySymbol(gig.currency)}${gig.pay_max}` : ''}
              </div>
              <div className="prima-map-work-poster">
                Posted by {gig.poster?.full_name || 'Anonymous'}
              </div>
            </div>
          </Popup>
        </Marker>
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

const MapCoverageGuard = () => {
  const map = useMap()
  useEffect(() => {
    const updateMinZoom = () => {
      const size = map.getSize()
      if (!size.x || !size.y) return

      const minZoom = Math.max(0, Math.ceil(Math.log2(Math.max(size.x, size.y) / 256)))
      map.setMinZoom(minZoom)
      if (map.getZoom() < minZoom) map.setZoom(minZoom)
    }

    map.whenReady(updateMinZoom)
    map.on('resize', updateMinZoom)
    return () => map.off('resize', updateMinZoom)
  }, [map])
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
          maxZoom={20}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          zoomControl={false}
          ref={mapRef}
        >
          <PrimaBasemap mode={darkMap ? 'dark' : 'light'} />
          <MapReady onReady={() => setMapReady(true)} />
          <MapCoverageGuard />
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
          className="prima-map-theme-toggle"
          onClick={() => setDarkMap(d => !d)}
          title={darkMap ? 'Switch to light map' : 'Switch to dark map'}
          style={{
            position: 'absolute', top: '8px', right: '12px', zIndex: 40,
            background: darkMap ? 'rgba(108,71,255,0.92)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(10px)',
            border: `1.5px solid ${darkMap ? 'var(--color-brand-mid)' : 'rgba(108,71,255,0.2)'}`,
            borderRadius: '20px', minHeight: '30px', height: '30px', padding: '3px 10px',
            fontSize: '10px', fontWeight: '700',
            color: darkMap ? 'var(--color-surface)' : 'var(--color-text-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)'
          }}>
          {darkMap ? 'Light' : 'Dark'}
        </button>

        {/* Live Stats Overlay */}
        <div style={{
          position: 'absolute', top: '14px', left: '14px',
          display: 'flex', gap: '8px', zIndex: 40
        }}>
          <div style={{
            background: 'var(--color-glass-surface)',
            backdropFilter: 'blur(12px) saturate(1.08)',
            borderRadius: '20px', padding: '6px 13px',
            display: 'flex', alignItems: 'center', gap: '6px',
            border: 'none',
            boxShadow: 'var(--shadow-glass)'
          }}>
            <span className="live-indicator-dot" aria-hidden="true" />
            <span style={{
              fontSize: '11px', fontWeight: '700', color: 'var(--color-text)'
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
              background: 'var(--color-surface)',
              border: '1px solid transparent',
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
            }}>All</button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.group}
              onClick={() => setCategoryFilter(
                categoryFilter === cat.group ? 'All' : cat.group
              )}
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${categoryFilter === cat.group ? 'var(--color-text)' : 'rgba(20,18,58,0.12)'}`,
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
              <CategoryIcon category={cat.group} size={16} color="var(--color-text-muted)" />
              {cat.group}
            </button>
          ))}
        </div>

        {/* Radius Filter Chips */}
        <div className="prima-map-distance-row" style={{
          position: 'absolute', top: '130px', left: '14px',
          zIndex: 40, display: 'flex', gap: '6px',
          pointerEvents: 'all'
        }}>
          {[null, 5, 10, 25].map(km => (
            <button
              className="prima-map-distance-chip"
              key={km ?? 'all'}
              onClick={() => setRadiusKm(radiusKm === km ? null : km)}
              style={{
                background: radiusKm === km
                  ? 'rgba(0,196,140,0.9)' : 'rgba(13,27,62,0.82)',
                backdropFilter: 'blur(8px)',
                border: `1.5px solid ${radiusKm === km ? 'var(--color-success)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '20px', padding: '4px 11px',
                fontSize: '10px', fontWeight: '700',
                color: 'var(--color-surface)', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit'
              }}>
              {km ? `${km}km` : 'Any distance'}
            </button>
          ))}
        </div>

      </div>

      {/* Happening Now Strip */}
      <div className="prima-happening-now" style={{
        background: 'var(--color-surface)',
        borderTop: '1.5px solid var(--color-border)',
        flexShrink: 0
      }}>
        <div className="prima-happening-now-header" style={{
          padding: '6px 12px 3px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{
            fontSize: '11px', fontWeight: '700',
            color: 'var(--color-text-subtle)', letterSpacing: '1px'
          }}>HAPPENING NOW</span>
          <span
            onClick={() => setShowAllGigs(true)}
            style={{
              fontSize: '11px', color: 'var(--color-brand)',
              fontWeight: '600', cursor: 'pointer'
            }}>See all ({filteredGigs.length}) <span aria-hidden="true">→</span></span>
        </div>

        {filteredGigs.length === 0 ? (
          <div className="prima-happening-now-empty" style={{
            padding: '9px 12px 11px',
            textAlign: 'center',
            color: 'var(--color-text-subtle)', fontSize: '12px'
          }}>
            {gigs.length === 0
              ? 'No live gigs yet. Be the first to post one!'
              : 'No gigs in this category nearby'}
          </div>
        ) : (
          <div className="prima-happening-now-list" style={{
            display: 'flex', gap: '10px',
            overflowX: 'auto', padding: '0 12px 7px',
            scrollbarWidth: 'none'
          }}>
            {filteredGigs.slice(0, 8).map(gig => (
              <div key={gig.id}
                onClick={() => openGig(gig)}
                className={selectedGig?.id === gig.id ? 'prima-now-card is-active' : 'prima-now-card'}
                style={{
                  background: selectedGig?.id === gig.id ? 'var(--color-brand-soft)' : 'var(--color-page)',
                  borderRadius: '12px', padding: '8px 10px',
                  minWidth: '164px',
                  border: `1.5px solid ${selectedGig?.id === gig.id ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                  boxShadow: selectedGig?.id === gig.id
                    ? '0 8px 24px rgba(108,71,255,0.18)'
                    : '0 4px 14px rgba(20,18,58,0.06)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = selectedGig?.id === gig.id ? 'var(--color-brand)' : 'var(--color-border)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}>
                <div className="prima-now-card-meta" style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: '4px'
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    background: gig.urgency === 'now' ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)',
                    border: `1px solid ${gig.urgency === 'now' ? 'var(--color-danger-border)' : 'var(--color-warning-border)'}`,
                    borderRadius: '4px', padding: '2px 6px',
                    fontSize: '8px', fontWeight: '800',
                    color: gig.urgency === 'now' ? 'var(--color-danger)' : 'var(--color-warning)',
                    letterSpacing: '0.8px'
                  }}>
                    {gig.urgency?.toUpperCase()}
                  </span>
                  {gig.type === 'digital' ? (
                    <span style={{
                      fontSize: '8px', fontWeight: '800',
                      color: 'var(--color-info)', letterSpacing: '0.5px'
                    }}>REMOTE</span>
                  ) : null}
                </div>
                <div className="prima-now-card-title" style={{
                  fontSize: '11px', fontWeight: '700',
                  color: 'var(--color-text)', marginBottom: '4px', lineHeight: '1.3'
                }}>{gig.title}</div>
                <div className="prima-now-card-pay" style={{
                  fontSize: '13px', fontWeight: '800', color: 'var(--color-success)'
                }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
                <div className="prima-now-card-distance" style={{ fontSize: '9px', color: 'var(--color-text-subtle)', marginTop: '3px' }}>
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
          <div className="prima-bottom-sheet gig-detail-scroll" onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-surface)',
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
                background: 'var(--color-border)', borderRadius: '2px'
              }} />
              <button
                onClick={() => { setSelectedGig(null); setApplied(false) }}
                aria-label="Close gig details"
                style={{
                  position: 'absolute', right: 0,
                  width: '32px', height: '32px', minHeight: '32px',
                  padding: 0, boxSizing: 'border-box', flexShrink: 0,
                  background: 'var(--color-brand-soft)', border: '1px solid var(--color-brand-border-strong)',
                  borderRadius: '10px', fontSize: '18px',
                  color: 'var(--color-brand)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', lineHeight: 1,
                  boxShadow: 'var(--shadow-glass)'
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
                    color: 'var(--color-brand)', marginBottom: '8px'
                  }}>Application Sent!</div>
                  <div style={{
                    fontSize: '13px', color: 'var(--color-text-muted)',
                    lineHeight: '1.6', marginBottom: '20px'
                  }}>
                    The client will review and confirm your application.
                    Once accepted you'll see the exact address.
                  </div>
                </div>

                {/* Exact address revealed after apply */}
                {(selectedGig.house_number || selectedGig.street || selectedGig.landmark) && (
                  <div style={{
                    background: 'linear-gradient(135deg, var(--color-brand-soft), var(--color-brand-pale))',
                    border: '1.5px solid var(--color-brand-border-strong)',
                    borderRadius: '16px', padding: '16px', marginBottom: '16px'
                  }}>
                    <div style={{
                      display: 'flex', gap: '8px', alignItems: 'center',
                      marginBottom: '12px'
                    }}>
                      <BrandIcon name="location" size={28} active />
                      <div style={{
                        fontSize: '12px', fontWeight: '700', color: 'var(--color-brand)',
                        textTransform: 'uppercase', letterSpacing: '0.8px'
                      }}>Exact Address</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedGig.house_number && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: 'var(--color-text-subtle)',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Building</span>
                          <span style={{
                            fontSize: '13px', fontWeight: '600', color: 'var(--color-text)'
                          }}>{selectedGig.house_number}</span>
                        </div>
                      )}
                      {selectedGig.street && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: 'var(--color-text-subtle)',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Street</span>
                          <span style={{
                            fontSize: '13px', fontWeight: '600', color: 'var(--color-text)'
                          }}>{selectedGig.street}</span>
                        </div>
                      )}
                      {selectedGig.landmark && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: 'var(--color-text-subtle)',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Landmark</span>
                          <span style={{
                            fontSize: '13px', fontWeight: '600', color: 'var(--color-text)'
                          }}>{selectedGig.landmark}</span>
                        </div>
                      )}
                      {selectedGig.directions && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', color: 'var(--color-text-subtle)',
                            textTransform: 'uppercase', minWidth: '60px', paddingTop: '2px'
                          }}>Directions</span>
                          <span style={{
                            fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.5'
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
                            background: 'var(--color-surface)', border: '1.5px solid var(--color-brand-border-strong)',
                            borderRadius: '10px', padding: '10px',
                            fontSize: '13px', fontWeight: '700',
                            color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit'
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
                    background: 'var(--color-brand-soft)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px', fontWeight: '800',
                    color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0,
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
                      fontSize: '14px', fontWeight: '700', color: 'var(--color-text)',
                      cursor: 'pointer'
                    }}>
                      {selectedGig.poster?.full_name || 'Anonymous'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      ⭐ {selectedGig.poster?.rating || 5.0} ·{' '}
                      {selectedGig.poster?.gigs_completed || 0} gigs ·{' '}
                      Trust {selectedGig.poster?.trust_score || 100}%
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
  {selectedGig.urgency?.toLowerCase() !== 'now' && <div style={{
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    background: `color-mix(in srgb, ${URGENCY_COLORS[selectedGig.urgency]} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${URGENCY_COLORS[selectedGig.urgency]} 28%, transparent)`,
    borderRadius: '6px', padding: '4px 10px',
    fontSize: '10px', fontWeight: '800',
    color: URGENCY_COLORS[selectedGig.urgency], letterSpacing: '0.8px'
  }}>
    {selectedGig.urgency?.toUpperCase()}
  </div>}
  {selectedGig.slots > 1 && (
    <span style={{
      background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)',
      borderRadius: '6px', padding: '3px 9px',
      fontSize: '9px', fontWeight: '700', color: 'var(--color-success)', whiteSpace: 'nowrap'
    }}>{selectedGig.slots} OPEN SLOTS</span>
  )}
</div>
                </div>

                {/* Title */}
                <h2 style={{
                  fontSize: '20px', fontWeight: '800',
                  color: 'var(--color-text)', lineHeight: '1.3', marginBottom: '8px'
                }}>{selectedGig.title}</h2>

                {/* Posted / Expiry timing */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>
                    Posted {timeAgo(selectedGig.created_at)}
                  </span>
                  {selectedGig.expires_at
                    ? <ExpiryBadge expiresAt={selectedGig.expires_at} />
                    : <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>Open-ended</span>
                  }
                </div>

                {/* Pay + Location */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '10px', marginBottom: '14px'
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg, var(--color-success-tint), var(--color-success-soft))',
                    border: 'none',
                    borderRadius: '14px', padding: '14px',
                    boxShadow: 'var(--shadow-glass)', backdropFilter: 'blur(12px) saturate(1.08)'
                  }}>
                    <div style={{
                      fontSize: '9px', color: 'var(--color-success)', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '4px'
                    }}>Pay Range</div>
                    <div style={{
                      fontSize: '24px', fontWeight: '800',
                      color: 'var(--color-success)', letterSpacing: '-0.5px'
                    }}>{getCurrencySymbol(selectedGig.currency)}{selectedGig.pay_min}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-success)', opacity: 0.7 }}>
                      up to {getCurrencySymbol(selectedGig.currency)}{selectedGig.pay_max}
                    </div>
                  </div>
                  <div style={{
                    background: selectedGig.type === 'digital' ? '#E0F2FE' : 'var(--color-warning-soft)',
                    border: 'none',
                    borderRadius: '14px', padding: '14px',
                    boxShadow: 'var(--shadow-glass)', backdropFilter: 'blur(12px) saturate(1.08)'
                  }}>
                    <div style={{
                      fontSize: '9px',
                      color: selectedGig.type === 'digital' ? 'var(--color-info)' : 'var(--color-warning)',
                      fontWeight: '700', textTransform: 'uppercase',
                      letterSpacing: '0.8px', marginBottom: '4px'
                    }}>{selectedGig.type === 'digital' ? 'Remote Work' : 'Location'}</div>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-text)', lineHeight: '1.3'
                    }}>{selectedGig.type === 'digital' ? 'Online / Remote' : (selectedGig.location || 'See details')}</div>
                    {selectedGig.latitude && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px',
                        color: selectedGig.type === 'digital' ? 'var(--color-info)' : 'var(--color-warning)',
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

                {/* Full address visible before applying */}
                {(selectedGig.house_number || selectedGig.street) && (
                  <div style={{
                    background: 'var(--color-warning-soft)', border: 'none',
                    borderRadius: '14px', padding: '14px', marginBottom: '14px',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                    boxShadow: 'var(--shadow-glass)', backdropFilter: 'blur(12px) saturate(1.08)'
                  }}>
                    <BrandIcon name="physical" size={32} active />
                    <div>
                      <div style={{
                        fontSize: '9px', fontWeight: '700', color: 'var(--color-warning)',
                        textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                      }}>Address</div>
                      {selectedGig.house_number && (
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)' }}>
                          {selectedGig.house_number}
                        </div>
                      )}
                      {selectedGig.street && (
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                          {selectedGig.street}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedGig.description && (
                  <div style={{
                    background: 'var(--color-page)', borderRadius: '12px',
                    padding: '14px', marginBottom: '14px',
                    fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6'
                  }}>{selectedGig.description}</div>
                )}

                {/* Receipt protection notice */}
                {selectedGig.payment_method === 'wallet' ? (
  <div style={{
    background: 'var(--color-success-soft)', border: 'none',
    borderRadius: '12px', padding: '14px',
    display: 'flex', gap: '10px', marginBottom: '20px',
    boxShadow: 'var(--shadow-glass)', backdropFilter: 'blur(12px) saturate(1.08)'
  }}>
    <BrandIcon name="pay" size={32} />
    <div style={{
      fontSize: '12px', color: 'var(--color-success)', lineHeight: '1.6'
    }}>
      Payment is already secured in escrow. You'll receive it automatically once the work is confirmed complete, with no chasing payment needed.
    </div>
  </div>
) : (
  <div style={{
    background: 'var(--color-brand-soft)', border: 'none',
    borderRadius: '12px', padding: '14px',
    display: 'flex', gap: '10px', marginBottom: '20px',
    boxShadow: 'var(--shadow-glass)', backdropFilter: 'blur(12px) saturate(1.08)'
  }}>
    <BrandIcon name="lock" size={32} />
    <div style={{
      fontSize: '12px', color: 'var(--color-brand)', lineHeight: '1.6'
    }}>
      Both parties confirm completion by uploading receipts with their names. No payment platform needed; the process is direct and protected.
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
                        ? 'var(--color-brand-soft)' : 'var(--color-page)',
                      border: `1.5px solid ${savedGigIds.has(selectedGig?.id)
                        ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                      borderRadius: '12px', padding: '11px',
                      fontSize: '13px', fontWeight: '700',
                      color: savedGigIds.has(selectedGig?.id)
                        ? 'var(--color-brand)' : 'var(--color-text-muted)',
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
                      flex: 1, background: 'var(--color-page)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: '12px', padding: '11px',
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-text-muted)', cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}>
                    <BrandIcon name="open" size={20} /> Share
                  </button>
                </div>

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
    justifyContent: 'center', gap: '6px',
    marginBottom: '8px'
  }}>
  Report This Gig
</button>

                {/* Action buttons */}
                {selectedGig.poster_id === user?.id ? (
                  <div style={{
                    marginTop: '12px',
                    background: 'var(--color-page)',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '13px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: 'var(--color-text-muted)',
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
                      flex: 1, background: 'var(--color-page)',
                      border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-brand)', cursor: 'pointer',
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
                        ? 'var(--color-brand-border-strong)'
                        : 'var(--color-brand-gradient)',
                      border: 'none', borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
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
      background: 'var(--color-surface)',
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
        borderBottom: '1px solid var(--color-page)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '36px', height: '4px', background: 'var(--color-border)', borderRadius: '2px' }} />
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text)' }}>All Nearby Gigs</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)', marginTop: '1px' }}>
            {filteredGigs.length} gig{filteredGigs.length !== 1 ? 's' : ''} in view
          </div>
        </div>
        <button onClick={() => setShowAllGigs(false)} style={{
          background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
          borderRadius: '50%', width: '32px', height: '32px',
          fontSize: '16px', color: 'var(--color-text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit'
        }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 24px' }}>
        {filteredGigs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-subtle)', fontSize: '13px' }}>
            No gigs match your filters
          </div>
        ) : filteredGigs.map(gig => (
          <div key={gig.id}
            onClick={() => { openGig(gig); setShowAllGigs(false) }}
            style={{
              background: 'var(--color-page)', borderRadius: '14px',
              padding: '14px', marginBottom: '10px',
              border: '1.5px solid var(--color-border)', cursor: 'pointer',
              transition: 'border-color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', flex: 1, paddingRight: '10px', lineHeight: '1.3' }}>
                {gig.title}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-success)', flexShrink: 0 }}>
                {getCurrencySymbol(gig.currency)}{gig.pay_min}–{gig.pay_max}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                background: gig.urgency === 'now' ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)',
                border: `1px solid ${gig.urgency === 'now' ? 'var(--color-danger-border)' : 'var(--color-warning-border)'}`,
                borderRadius: '4px', padding: '2px 7px',
                fontSize: '9px', fontWeight: '800',
                color: gig.urgency === 'now' ? 'var(--color-danger)' : 'var(--color-warning)', letterSpacing: '0.8px'
              }}>{gig.urgency?.toUpperCase()}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>
                {formatDist(calcDistance(userPos[0], userPos[1], gig.latitude, gig.longitude))} away
              </span>
              {gig.type === 'digital' && (
                <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--color-info)', letterSpacing: '0.5px' }}>REMOTE</span>
              )}
              {gig.field && (
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{gig.field}</span>
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
        .live-indicator-dot {
          width: 7px;
          height: 7px;
          flex: 0 0 7px;
          border-radius: 50%;
          background: var(--color-success-accent);
          box-shadow: 0 0 0 0 rgba(0, 196, 140, 0.55);
          animation: liveIndicatorPulse 1.8s ease-out infinite;
        }
        @keyframes liveIndicatorPulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 196, 140, 0.55); }
          70% { box-shadow: 0 0 0 6px rgba(0, 196, 140, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 196, 140, 0); }
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
          background: var(--color-border);
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
          border: none !important;
          background: var(--color-glass-surface) !important;
          backdrop-filter: blur(14px) saturate(1.1);
        }
        .prima-work-popup .leaflet-popup-content { margin: 0; }
        .prima-work-popup .leaflet-popup-tip {
          background: var(--color-glass-surface) !important;
          box-shadow: 0 4px 10px rgba(31,24,77,0.06);
        }
        .prima-map-work-card {
          position: relative;
          width: 100%;
          box-sizing: border-box;
          padding: 14px;
          color: var(--color-text);
          font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .prima-map-work-address {
          display: grid;
          gap: 4px;
          margin: 0 0 9px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(108,71,255,0.07);
          color: var(--color-text-muted);
          font-size: 11px;
          line-height: 1.35;
        }
        .prima-map-work-address-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .prima-map-work-address-row svg {
          flex: 0 0 auto;
          color: var(--color-brand);
        }
        .prima-map-work-title {
          margin-bottom: 3px;
          color: var(--color-text);
          font-size: 14px;
          font-weight: 800;
          line-height: 1.35;
        }
        .prima-map-work-pay {
          margin-bottom: 6px;
          color: var(--color-success);
          font-size: 14px;
          font-weight: 800;
        }
        .prima-map-work-poster {
          color: var(--color-text-subtle);
          font-size: 11px;
          line-height: 1.35;
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
          box-sizing: border-box;
          border-radius: 50%;
          padding: 0;
          background: var(--color-brand-soft);
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
        .prima-gig-location-badge {
          position: absolute;
          top: 35px;
          left: 50%;
          z-index: 3;
          width: 19px;
          height: 19px;
          display: grid;
          place-items: center;
          transform: translateX(-50%);
          border: 2px solid #fff;
          border-radius: 50%;
          background: var(--color-brand-gradient);
          color: #fff;
          box-shadow: 0 2px 7px rgba(72, 42, 170, 0.3);
        }
        .prima-gig-location-badge svg {
          width: 11px;
          height: 11px;
        }
        .prima-gig-avatar::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          padding: 3px;
          background: var(--color-brand-gradient);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          z-index: 2;
        }
        .prima-gig-avatar-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          background: transparent;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .prima-gig-avatar-inner img {
          position: absolute;
          inset: 0;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          display: block;
          border-radius: 50%;
          object-fit: cover;
        }
        .prima-gig-avatar-inner span {
          color: var(--color-brand);
        }
        .custom-gig-pin:hover .prima-gig-avatar {
          transform: scale(1.05);
        }
        .prima-gig-pin.is-selected .prima-gig-avatar {
          transform: scale(1.08);
          box-shadow: 0 8px 22px rgba(108,71,255,0.32);
        }
        .prima-gig-pin.is-selected .prima-gig-label {
          color: var(--color-brand);
        }
        .prima-gig-label {
          background: rgba(255, 255, 255, 0.96);
          border-radius: 8px;
          padding: 3px 7px;
          font-size: 10px;
          font-weight: 700;
          color: var(--color-text);
          box-shadow: 0 2px 8px rgba(20, 18, 58, 0.14);
          margin-top: 8px;
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
          background: var(--color-brand);
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
        @keyframes primaPinDrop {
          0% { transform: translateY(-10px) scale(0.86); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes primaPinFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @media (max-width: 600px) {
          .prima-map-theme-toggle { top: 6px !important; right: 8px !important; min-height: 28px !important; height: 28px !important; padding: 2px 8px !important; font-size: 9px !important; }
          .prima-map-distance-row { gap: 4px !important; }
          .prima-map-distance-chip { min-height: 28px !important; height: 28px !important; box-sizing: border-box; padding: 2px 8px !important; font-size: 10px !important; }
          .prima-happening-now-header { padding: 4px 10px 2px !important; }
          .prima-happening-now-header > span:first-child { font-size: 9px !important; letter-spacing: 0.7px !important; }
          .prima-happening-now-header > span:last-child { font-size: 10px !important; }
          .prima-happening-now-list { gap: 8px !important; padding: 0 10px 5px !important; }
          .prima-now-card { min-width: 138px !important; padding: 6px 8px !important; }
          .prima-now-card-meta { margin-bottom: 3px !important; }
          .prima-now-card-meta span { font-size: 7px !important; padding: 1px 4px !important; }
          .prima-now-card-title { font-size: 10px !important; margin-bottom: 3px !important; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
          .prima-now-card-pay { font-size: 12px !important; }
          .prima-now-card-distance { display: none !important; }
          .prima-happening-now-empty { padding: 7px 10px 8px !important; font-size: 11px !important; }
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
