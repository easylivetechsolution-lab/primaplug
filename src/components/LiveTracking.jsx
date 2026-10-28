import { useState, useEffect, useRef } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../supabase'
import { showToast } from '../utils/toast'
import { useAuth } from '../context/AuthContext'
import PrimaBasemap from './maps/PrimaBasemap'

// Worker moving pin
const createWorkerPin = (avatarUrl, initial) => L.divIcon({
  className: '',
  html: `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
    ">
      <div style="
        width: 44px; height: 44px;
        box-sizing: border-box;
        border-radius: 50%;
        padding: 3px;
        background: var(--color-brand-gradient);
        box-shadow: 0 5px 14px rgba(20,18,58,0.24);
        overflow: hidden;
        position: relative;
        z-index: 2;
      ">
        <div style="
          width: 100%; height: 100%;
          border-radius: 50%;
          overflow: hidden;
          background: var(--color-brand-soft);
          display: flex; align-items: center; justify-content: center;
          color: var(--color-brand);
          font-size: 16px; font-weight: 800;
        ">${avatarUrl
          ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`
          : `<span>${initial}</span>`
        }</div>
      </div>
      <span style="
        position: absolute;
        top: 35px;
        left: 50%;
        z-index: 3;
        width: 19px; height: 19px;
        display: grid; place-items: center;
        transform: translateX(-50%);
        box-sizing: border-box;
        border: 2px solid #fff;
        border-radius: 50%;
        background: var(--color-brand-gradient);
        color: #fff;
        box-shadow: 0 2px 7px rgba(72,42,170,0.3);
      ">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
      </span>
      <div style="
        background: rgba(255,255,255,0.96);
        color: var(--color-brand);
        font-size: 10px;
        font-weight: 700;
        padding: 3px 7px;
        border-radius: 8px;
        margin-top: 8px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(20,18,58,0.14);
        font-family: 'Plus Jakarta Sans', sans-serif;
      ">ON THE WAY</div>
    </div>
  `,
  iconSize: [44, 62],
  iconAnchor: [22, 62],
  popupAnchor: [0, -62],
})

// Destination pin — shows poster's profile photo
const createDestinationPin = (avatarUrl, initial, label = 'DESTINATION') => L.divIcon({
  className: '',
  html: `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
    ">
      <div style="
        width: 44px; height: 44px;
        border-radius: 50%;
        background: linear-gradient(#fff, #fff) padding-box, var(--color-brand-gradient) border-box;
        border: 3px solid transparent;
        box-shadow: 0 5px 14px rgba(20,18,58,0.24);
        display: flex; align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative; z-index: 2;
        font-size: 18px; font-weight: 800;
        color: var(--color-brand);
      ">
        ${avatarUrl
          ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : `<span style="font-size:20px;">${initial || '📍'}</span>`
        }
      </div>
      <span style="
        position: absolute;
        top: 35px;
        left: 50%;
        z-index: 3;
        width: 19px; height: 19px;
        display: grid; place-items: center;
        transform: translateX(-50%);
        box-sizing: border-box;
        border: 2px solid #fff;
        border-radius: 50%;
        background: var(--color-brand-gradient);
        color: #fff;
        box-shadow: 0 2px 7px rgba(72,42,170,0.3);
      ">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
      </span>
      <div style="
        background: rgba(255,255,255,0.96);
        color: var(--color-brand);
        font-size: 10px;
        font-weight: 700;
        padding: 3px 7px;
        border-radius: 8px;
        margin-top: 8px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(20,18,58,0.14);
        font-family: 'Plus Jakarta Sans', sans-serif;
      ">${label}</div>
    </div>
  `,
  iconSize: [44, 62],
  iconAnchor: [22, 62],
  popupAnchor: [0, -62],
})

// Auto-fit map to show both pins — mobile: once only; desktop: on every update
const FitBounds = ({ positions }) => {
  const map = useMap()
  const hasFitted = useRef(false)
  const isMobile = window.innerWidth <= 768
  useEffect(() => {
    if (positions.length >= 2) {
      if (isMobile && hasFitted.current) return
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [60, 60] })
      hasFitted.current = true
    }
  }, [positions])
  return null
}

// Calculate distance between two coords in km
const getDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

const formatEta = (minutes) => {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

// Find nearest point on stored route and return only the path ahead
const clipRoute = (route, workerPos, destLat, destLng) => {
  if (route.length < 2) return [workerPos, [destLat, destLng]]
  let minDist = Infinity
  let nearestIdx = 0
  for (let i = 0; i < route.length; i++) {
    const d = getDistance(workerPos[0], workerPos[1], route[i][0], route[i][1])
    if (d < minDist) { minDist = d; nearestIdx = i }
  }
  return [workerPos, ...route.slice(nearestIdx + 1)]
}

// Real route from OSRM in background
const getRoute = async (fromLat, fromLng, toLat, toLng) => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
    clearTimeout(timeout)
    const data = await res.json()
    if (data.routes?.[0]) {
      const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
      const duration = Math.round(data.routes[0].duration / 60)
      return { coords, duration }
    }
  } catch (e) {
    console.log('Route fetch failed, using straight line')
  }
  return null
}

export default function LiveTracking({ gig, role, workerInfo, posterInfo, onClose }) {
  // role = 'worker' | 'poster'
  const { user, profile } = useAuth()
  const [workerPos, setWorkerPos] = useState(null)
  const [route, setRoute] = useState([])
  const [eta, setEta] = useState(null)
  const [distance, setDistance] = useState(null)
  const [tracking, setTracking] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [arrivalConfirmed, setArrivalConfirmed] = useState(false)
  const [pastScheduledGrace, setPastScheduledGrace] = useState(false)
  const [nearDestination, setNearDestination] = useState(false)
  const [confirmingArrival, setConfirmingArrival] = useState(false)
  const watchIdRef = useRef(null)
  const [resolvedPosterInfo, setResolvedPosterInfo] = useState(posterInfo)
  const channelRef = useRef()
  const fullRouteRef = useRef([]) // complete OSRM route, fetched once
  const trackingLoadErrorRef = useRef(false)

  const destLat = parseFloat(gig.latitude)
  const destLng = parseFloat(gig.longitude)
  const hasDestination = !isNaN(destLat) && !isNaN(destLng)
  const trackingWorkerId = role === 'worker'
    ? user?.id
    : workerInfo?.id || gig.worker_id || gig.applications?.find(application => application.status === 'accepted')?.worker_id
  const workerAvatarUrl = workerInfo?.avatar_url || (role === 'worker' ? profile?.avatar_url : null)
  const workerInitial = workerInfo?.full_name?.trim()?.charAt(0)
    || (role === 'worker' ? profile?.full_name?.trim()?.charAt(0) : null)
    || user?.email?.trim()?.charAt(0)?.toUpperCase()
    || '?'
  const checkInUserId = role === 'worker' ? gig.poster_id : trackingWorkerId
  const exactAddress = [gig.house_number, gig.street, gig.location]
    .filter(value => value != null && String(value).trim())
    .map(value => String(value).trim())
    .join(', ')
  const addressDirections = [gig.landmark, gig.directions]
    .filter(value => value != null && String(value).trim())
    .map(value => String(value).trim())
    .join(' · ')

  useEffect(() => {
    if (!gig.scheduled_start_at) {
      setPastScheduledGrace(false)
      return
    }
    const updateGraceState = () => {
      const startsAt = new Date(gig.scheduled_start_at).getTime()
      setPastScheduledGrace(Number.isFinite(startsAt) && Date.now() >= startsAt + 30 * 60 * 1000)
    }
    updateGraceState()
    const timer = window.setInterval(updateGraceState, 30_000)
    return () => window.clearInterval(timer)
  }, [gig.scheduled_start_at])

  // When poster tracks a worker, posterInfo isn't passed — fetch own profile instead
  useEffect(() => {
    if (!posterInfo && role === 'poster' && user) {
      supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => { if (data) setResolvedPosterInfo(data) })
    }
  }, [])

  useEffect(() => {
    if (role === 'poster') {
      // Poster subscribes to worker location updates
      subscribeToWorkerLocation()
      // Keep tracking usable if Realtime is not enabled for this table/project.
      const pollId = window.setInterval(fetchWorkerLocation, 10000)
      return () => {
        window.clearInterval(pollId)
        if (channelRef.current) supabase.removeChannel(channelRef.current)
      }
    }
    if (role === 'worker') {
      subscribeToWorkerLocation()
      return () => {
        if (channelRef.current) supabase.removeChannel(channelRef.current)
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
          if (user?.id) {
            void supabase
              .from('worker_locations')
              .update({ is_active: false })
              .eq('gig_id', gig.id)
              .eq('worker_id', user.id)
          }
        }
      }
    }
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  useEffect(() => {
    if (workerPos && hasDestination) {
      updateRoute()
      const dist = getDistance(
        workerPos[0], workerPos[1], destLat, destLng
      )
      setDistance(dist)
      // GPS proximity is only a hint; the worker must explicitly report arrival.
      setNearDestination(dist < 0.05)
    } else {
      setNearDestination(false)
    }
  }, [workerPos])

  const subscribeToWorkerLocation = () => {
    channelRef.current = supabase
      .channel('worker-location-' + gig.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'worker_locations',
        filter: `gig_id=eq.${gig.id}`
      }, (payload) => {
        if (trackingWorkerId && payload.new?.worker_id !== trackingWorkerId) return
        if (payload.new) {
          setArrived(Boolean(payload.new.worker_arrived_at))
          setArrivalConfirmed(Boolean(payload.new.poster_confirmed_arrival_at))
        }
        if (payload.new?.is_active) {
          setWorkerPos([
            parseFloat(payload.new.latitude),
            parseFloat(payload.new.longitude)
          ])
          setTracking(true)
        } else if (payload.new) {
          setWorkerPos(null)
          setTracking(false)
        }
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Worker location Realtime subscription failed:', status, error)
        }
      })

    // Also fetch latest position
    fetchWorkerLocation()
  }

  const fetchWorkerLocation = async () => {
    let query = supabase
      .from('worker_locations')
      .select('*')
      .eq('gig_id', gig.id)
    if (trackingWorkerId) query = query.eq('worker_id', trackingWorkerId)
    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('Could not load worker location:', error)
      if (!trackingLoadErrorRef.current) {
        trackingLoadErrorRef.current = true
        showToast('Could not load live tracking. Check the worker_locations table and its access policies in Supabase.', 'error')
      }
      return
    }
    trackingLoadErrorRef.current = false
    if (data) {
      setArrived(Boolean(data.worker_arrived_at))
      setArrivalConfirmed(Boolean(data.poster_confirmed_arrival_at))
      if (data.is_active) {
        setWorkerPos([parseFloat(data.latitude), parseFloat(data.longitude)])
        setTracking(true)
      } else {
        setWorkerPos(null)
        setTracking(false)
      }
    } else {
      setWorkerPos(null)
      setTracking(false)
      setArrived(false)
      setArrivalConfirmed(false)
    }
  }

  const updateRoute = async () => {
    if (!workerPos || !hasDestination) return

    if (fullRouteRef.current.length === 0) {
      const result = await getRoute(workerPos[0], workerPos[1], destLat, destLng)
      if (result) {
        fullRouteRef.current = result.coords
        setRoute(result.coords)
        setEta(result.duration)
      } else if (distance) {
        setEta(Math.round(distance / 0.5))
      }
    } else {
      // Subsequent updates — clip stored route, no new network call
      const remaining = clipRoute(fullRouteRef.current, workerPos, destLat, destLng)
      setRoute(remaining)
      let remainingKm = 0
      for (let i = 0; i < remaining.length - 1; i++) {
        remainingKm += getDistance(remaining[i][0], remaining[i][1], remaining[i+1][0], remaining[i+1][1])
      }
      setEta(Math.round(remainingKm / 0.5))
    }
  }

  const startTracking = () => {
    if (arrived) {
      showToast('You have already reported arrival for this gig.', 'info')
      return
    }
    if (!navigator.geolocation) {
      showToast('Geolocation not supported on this device', 'error')
      return
    }
    if (!user?.id) {
      showToast('Please sign in again before sharing your location.', 'error')
      return
    }

    let locationWatchId = null
    let notifiedPoster = false
    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const { error } = await supabase
          .from('worker_locations')
          .upsert({
            gig_id: gig.id,
            worker_id: user.id,
            latitude: lat,
            longitude: lng,
            heading: position.coords.heading,
            speed: position.coords.speed,
            is_active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'gig_id,worker_id' })

        if (error) {
          console.error('Could not share worker location:', error)
          showToast(`Could not share location: ${error.message || 'Supabase rejected the location update.'}`, 'error')
          if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId)
          watchIdRef.current = null
          setTracking(false)
          return
        }

        setWorkerPos([lat, lng])
        setTracking(true)
        if (!notifiedPoster) {
          notifiedPoster = true
          void supabase.from('notifications').insert({
            user_id: gig.poster_id,
            title: 'Worker is on the way!',
            message: `Your worker has started heading to "${gig.title}"`,
            type: 'general',
            gig_id: gig.id
          })
        }
      },
      (err) => {
        console.error('Location error:', err)
        setTracking(false)
        showToast(err.code === 1
          ? 'Allow location access in your browser to start live tracking.'
          : 'Could not get your location. Please try again.', 'error')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    )

    locationWatchId = id
    watchIdRef.current = id
  }

  const stopTracking = async () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setTracking(false)
    fullRouteRef.current = []

    await supabase
      .from('worker_locations')
      .update({ is_active: false })
      .eq('gig_id', gig.id)
      .eq('worker_id', user.id)
  }

  const reportArrival = async () => {
    if (arrived || !tracking || !user?.id) return
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setTracking(false)
    fullRouteRef.current = []

    const { error } = await supabase.rpc('report_gig_worker_arrival', {
      p_gig_id: gig.id
    })
    if (error) {
      console.error('Could not report worker arrival:', error)
      const { error: stopError } = await supabase
        .from('worker_locations')
        .update({ is_active: false })
        .eq('gig_id', gig.id)
        .eq('worker_id', user.id)
      if (stopError) console.error('Could not stop location sharing:', stopError)
      showToast(`Could not report arrival: ${error.message}`, 'error')
      return
    }

    setArrived(true)
    setArrivalConfirmed(false)
    setWorkerPos(null)
    void supabase.from('notifications').insert({
      user_id: gig.poster_id,
      title: 'Worker reported arrival',
      message: `The worker reported arriving for "${gig.title}". Please confirm their arrival in live tracking.`,
      type: 'general',
      gig_id: gig.id
    })
  }

  const confirmWorkerArrival = async () => {
    if (!trackingWorkerId || confirmingArrival) return
    setConfirmingArrival(true)
    const { error } = await supabase.rpc('confirm_gig_worker_arrival', {
      p_gig_id: gig.id,
      p_worker_id: trackingWorkerId
    })
    setConfirmingArrival(false)
    if (error) {
      console.error('Could not confirm worker arrival:', error)
      showToast(`Could not confirm arrival: ${error.message}`, 'error')
      return
    }

    setArrivalConfirmed(true)
    void supabase.from('notifications').insert({
      user_id: trackingWorkerId,
      title: 'Arrival confirmed',
      message: `The poster confirmed your arrival for "${gig.title}".`,
      type: 'general',
      gig_id: gig.id
    })
  }

  const allPositions = [
    workerPos,
    hasDestination ? [destLat, destLng] : null
  ].filter(Boolean)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--color-surface)',
      zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      touchAction: 'none'
    }}>
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: '0 0 20px 20px',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexShrink: 0,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div>
          <div style={{
            fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px'
          }}>
            {role === 'worker' ? '🧭 Navigation' : '📍 Live Tracking'}
          </div>
          <div style={{
            fontSize: '15px', fontWeight: '800', color: 'var(--color-text)'
          }}>{gig.title}</div>
              {gig.type === 'physical' && exactAddress && (
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '3px', maxWidth: 'min(70vw, 440px)' }}>
                  {exactAddress}{addressDirections ? ` · ${addressDirections}` : ''}
                </div>
              )}
        </div>
        <button  onClick={onClose} style={{
          background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
          borderRadius: '10px', width: '36px', height: '36px',
          fontSize: '18px', color: 'var(--color-text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit'
        }}>×</button>
      </div>

      {/* Stats Bar */}
      {(eta || distance) && (
        <div className="prima-eta-panel" style={{
          background: 'linear-gradient(135deg, var(--color-surface), var(--color-surface-tint))',
          padding: '12px 20px',
          display: 'flex', gap: '12px',
          borderBottom: '1px solid var(--color-border)', flexShrink: 0,
          boxShadow: '0 8px 22px rgba(20,18,58,0.08)',
          position: 'relative', zIndex: 3
        }}>
          {eta && (
            <div style={{
              background: 'var(--color-brand-soft)', borderRadius: '12px',
              padding: '9px 15px', textAlign: 'center',
              border: '1px solid var(--color-border-soft)',
              boxShadow: '0 6px 16px rgba(108,71,255,0.12)'
            }}>
              <div style={{
                fontSize: '16px', fontWeight: '800', color: 'var(--color-brand)'
              }}>{formatEta(eta)}</div>
              <div style={{
                fontSize: '12px', color: 'var(--color-text-subtle)',
                fontWeight: '600', textTransform: 'uppercase'
              }}>ETA</div>
            </div>
          )}
          {distance && (
            <div style={{
              background: 'var(--color-surface)', borderRadius: '12px',
              padding: '9px 15px', textAlign: 'center',
              border: '1px solid var(--color-border)',
              boxShadow: '0 6px 16px rgba(20,18,58,0.06)'
            }}>
              <div style={{
                fontSize: '16px', fontWeight: '800', color: 'var(--color-text)'
              }}>
                {distance < 1
                  ? `${Math.round(distance * 1000)}m`
                  : `${distance.toFixed(1)}km`}
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--color-text-subtle)',
                fontWeight: '600', textTransform: 'uppercase'
              }}>Distance</div>
            </div>
          )}
          {arrived && (
            <div style={{
              background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
              borderRadius: '10px', padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <span style={{ fontSize: '16px' }}>✅</span>
              <div style={{
                fontSize: '13px', fontWeight: '700', color: 'var(--color-success)'
              }}>Arrived!</div>
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div style={{
        flex: 1, position: 'relative',
        touchAction: 'pan-x pan-y pinch-zoom'
      }}>
        <MapContainer
          center={workerPos || [destLat || 6.5244, destLng || 3.3792]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          touchZoom={true}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          dragging={true}
        >
          <PrimaBasemap mode="light" />

          {allPositions.length >= 2 && <FitBounds positions={allPositions} />}

          {/* Worker pin */}
          {workerPos && (
            <Marker
              position={workerPos}
              icon={createWorkerPin(
                workerAvatarUrl,
                workerInitial
              )}>
              <Popup>
                <div style={{ fontFamily: 'inherit', fontSize: '13px' }}>
                  <strong>{workerInfo?.full_name || (role === 'worker' ? profile?.full_name : null) || 'Worker'}</strong>
                  <br />On the way...
                </div>
              </Popup>
            </Marker>
          )}

          {/* Destination pin — poster's profile photo */}
          {hasDestination && (
            <Marker
              position={[destLat, destLng]}
              icon={createDestinationPin(
                resolvedPosterInfo?.avatar_url,
                resolvedPosterInfo?.full_name?.charAt(0) || '📍',
                gig.type === 'physical' ? 'AREA PIN' : 'DESTINATION'
              )}>
              <Popup>
                <div style={{ fontFamily: 'inherit', fontSize: '13px' }}>
                  <strong>{gig.type === 'physical' ? 'Area pin' : '📍 Destination'} · {gig.location || 'Location unavailable'}</strong>
                  {resolvedPosterInfo?.full_name && (
                    <><br />{resolvedPosterInfo.full_name}</>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route line */}
          {route.length > 0 && (
            <>
              {/* Shadow line */}
              <Polyline
                positions={route}
                color="rgba(108,71,255,0.15)"
                weight={12}
                lineCap="round"
                lineJoin="round"
              />
              {/* Main route line */}
              <Polyline
                positions={route}
                color="var(--color-brand)"
                weight={5}
                opacity={0.9}
                dashArray="12 12"
                className="prima-route-flow"
                lineCap="round"
                lineJoin="round"
              />
              {/* White center line for premium look */}
              <Polyline
                positions={route}
                color="rgba(255,255,255,0.4)"
                weight={2}
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
        </MapContainer>

        {/* No destination warning */}
        {!hasDestination && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface)', borderRadius: '16px',
            padding: '20px 24px', textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            zIndex: 1000, maxWidth: '280px'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{
              fontSize: '14px', fontWeight: '700',
              color: 'var(--color-text)', marginBottom: '4px'
            }}>No map pin set</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', lineHeight: '1.5' }}>
              The poster hasn't set map coordinates for this gig. Check the address details above if available, or message the poster for directions.
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div style={{
        background: 'var(--color-surface)',
        borderTop: '1.5px solid var(--color-border)',
        padding: '16px 20px',
        flexShrink: 0
      }}>
        {pastScheduledGrace && !arrived && (
          <div style={{
            background: 'var(--color-warning-soft)',
            border: '1px solid var(--color-warning-border)',
            borderRadius: '12px', padding: '12px 14px', marginBottom: '10px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-warning)', marginBottom: '4px' }}>
              Scheduled start was over 30 minutes ago
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.45, marginBottom: '9px' }}>
              Check in with the other person. This reminder does not automatically mark anyone as a no-show.
            </div>
            {checkInUserId && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('openChatWithUser', { detail: { userId: checkInUserId } }))}
                style={{
                  background: 'var(--color-brand-gradient)', border: 0, borderRadius: '9px',
                  padding: '9px 13px', color: '#fff', fontSize: '12px', fontWeight: '700',
                  fontFamily: 'inherit', cursor: 'pointer'
                }}
              >Message {role === 'worker' ? 'poster' : 'worker'}</button>
            )}
          </div>
        )}

        {role === 'worker' && !arrived && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!tracking ? (
              <>
                <div style={{
                  background: 'var(--color-brand-soft)',
                  border: '1px solid var(--color-brand-border-strong)',
                  borderRadius: '12px', padding: '11px 13px',
                  color: 'var(--color-text-muted)', fontSize: '12px', lineHeight: 1.5
                }}>
                  Starting navigation shares your live location with the gig poster. You can stop sharing anytime; it also stops when you report arrival.
                </div>
                <button
                  onClick={startTracking}
                  style={{
                    width: '100%',
                    background: 'var(--color-brand-gradient)',
                    border: 'none', borderRadius: '14px', padding: '15px',
                    fontSize: '15px', fontWeight: '700', color: 'var(--color-surface)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 20px rgba(108,71,255,0.4)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '8px'
                  }}>
                  <span>🧭</span> Start Navigation
                </button>
              </>
            ) : (
              <>
                {(eta || distance) && (
                  <div style={{
                    background: 'linear-gradient(135deg, var(--color-text), var(--color-brand-deep))',
                    borderRadius: '14px', padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: '16px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#C9C6FF', fontWeight: '700', letterSpacing: '1px', marginBottom: '2px' }}>
                        ETA TO JOB SITE
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--color-surface)', lineHeight: 1 }}>
                        {eta ? formatEta(eta) : '—'}
                      </div>
                      {distance && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '3px' }}>
                          {distance < 1
                            ? `${Math.round(distance * 1000)}m remaining`
                            : `${distance.toFixed(1)}km remaining`}
                        </div>
                      )}
                    </div>
                    <div style={{
                      background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)',
                      borderRadius: '10px', padding: '6px 10px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-success)',
                      display: 'flex', alignItems: 'center', gap: '5px'
                    }}>
                      LIVE
                    </div>
                  </div>
                )}
                <div style={{
                  background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
                  borderRadius: '12px', padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-success)' }}>
                      Live tracking active
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      The gig poster can see your live location
                    </div>
                  </div>
                </div>
                {nearDestination && (
                  <div style={{
                    background: 'var(--color-warning-soft)',
                    border: '1px solid var(--color-warning-border)',
                    borderRadius: '10px', padding: '10px 12px',
                    color: 'var(--color-warning)', fontSize: '12px', fontWeight: '600'
                  }}>
                    You appear close to the destination. Report arrival when you are at the job site.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={reportArrival}
                    style={{
                      flex: 2,
                      background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                      border: 'none', borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px'
                    }}>
                    <span>📍</span> I've Arrived
                  </button>
                  <button
                    onClick={stopTracking}
                    style={{
                      flex: 1, background: 'var(--color-danger-soft)',
                      border: '1.5px solid var(--color-danger-border)',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-danger)', cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}>Stop</button>
                </div>
              </>
            )}
          </div>
        )}

        {role === 'poster' && (
          <div>
            {!tracking && !arrived ? (
              <div style={{
                textAlign: 'center', padding: '8px',
                display: 'flex', gap: '10px',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--color-text-subtle)'
                }} />
                <span style={{
                  fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: '500'
                }}>
                  Waiting for the worker to start navigation. Their live location appears after they tap “Start Navigation” and allow location access.
                </span>
              </div>
            ) : arrived ? (
              <div style={{
                background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
                borderRadius: '12px', padding: '14px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>✅</div>
                <div style={{
                  fontSize: '14px', fontWeight: '700', color: 'var(--color-success)'
                }}>{arrivalConfirmed ? 'Arrival confirmed' : 'Worker reported arrival'}</div>
                {!arrivalConfirmed && (
                  <button
                    onClick={confirmWorkerArrival}
                    disabled={confirmingArrival}
                    style={{
                      marginTop: '12px',
                      background: 'var(--color-brand-gradient)',
                      border: 'none', borderRadius: '10px', padding: '11px 16px',
                      color: '#fff', fontSize: '13px', fontWeight: '700',
                      cursor: confirmingArrival ? 'wait' : 'pointer',
                      fontFamily: 'inherit', opacity: confirmingArrival ? 0.7 : 1
                    }}
                  >{confirmingArrival ? 'Confirming…' : 'Confirm worker arrival'}</button>
                )}
              </div>
            ) : (
              <div style={{
                background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                borderRadius: '12px', padding: '14px',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <div>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: 'var(--color-brand)'
                  }}>
                    {workerInfo?.full_name?.split(' ')[0] || 'Worker'} is on the way
                  </div>
                  {eta && (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      Arrives in about {formatEta(eta)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {arrived && role === 'worker' && (
          <div style={{
            background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
            borderRadius: '12px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
            <div style={{
              fontSize: '15px', fontWeight: '700',
              color: 'var(--color-success)', marginBottom: '4px'
            }}>{arrivalConfirmed ? 'Arrival confirmed' : 'You reported arrival'}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {arrivalConfirmed ? 'The poster confirmed your arrival.' : 'Location sharing has stopped. Waiting for the poster to confirm.'}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .leaflet-container {
          touch-action: pan-x pan-y pinch-zoom !important;
        }
        .prima-route-flow {
          animation: primaRouteFlow 1s linear infinite;
        }
        @keyframes primaRouteFlow {
          to { stroke-dashoffset: -24; }
        }
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
      `}</style>
    </div>
  )
}
