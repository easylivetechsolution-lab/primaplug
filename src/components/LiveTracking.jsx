import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

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
        position: absolute;
        inset: -10px;
        border-radius: 50%;
        background: rgba(108,71,255,0.15);
        animation: workerPulse 1.5s ease-out infinite;
      "></div>
      <div style="
        width: 48px; height: 48px;
        border-radius: 50%;
        background: #fff;
        border: 3px solid #6C47FF;
        box-shadow: 0 4px 20px rgba(108,71,255,0.5);
        display: flex; align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative; z-index: 2;
        font-size: 18px; font-weight: 800;
        color: #6C47FF;
      ">
        ${avatarUrl
          ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : `<span>${initial}</span>`
        }
      </div>
      <div style="
        background: #6C47FF;
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 10px;
        margin-top: 3px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(108,71,255,0.4);
      ">ON THE WAY</div>
      <div style="
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid #6C47FF;
        margin-top: -1px;
      "></div>
    </div>
    <style>
      @keyframes workerPulse {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(2.5); opacity: 0; }
      }
    </style>
  `,
  iconSize: [48, 80],
  iconAnchor: [24, 80],
  popupAnchor: [0, -80],
})

// Destination pin — shows poster's profile photo
const createDestinationPin = (avatarUrl, initial) => L.divIcon({
  className: '',
  html: `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
    ">
      <div style="
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        border: 3px solid #FF3366;
        opacity: 0.5;
        animation: destPulse 2s ease-out infinite;
      "></div>
      <div style="
        position: absolute;
        inset: -16px;
        border-radius: 50%;
        border: 2px solid #FF3366;
        opacity: 0.25;
        animation: destPulse 2s ease-out infinite 0.5s;
      "></div>
      <div style="
        width: 48px; height: 48px;
        border-radius: 50%;
        background: #fff;
        border: 3px solid #FF3366;
        box-shadow: 0 4px 20px rgba(255,51,102,0.5);
        display: flex; align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative; z-index: 2;
        font-size: 18px; font-weight: 800;
        color: #FF3366;
      ">
        ${avatarUrl
          ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : `<span style="font-size:20px;">${initial || '📍'}</span>`
        }
      </div>
      <div style="
        background: #FF3366;
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 10px;
        margin-top: 3px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(255,51,102,0.4);
      ">DESTINATION</div>
      <div style="
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid #FF3366;
        margin-top: -1px;
      "></div>
    </div>
    <style>
      @keyframes destPulse {
        0% { transform: scale(1); opacity: 0.5; }
        100% { transform: scale(2); opacity: 0; }
      }
    </style>
  `,
  iconSize: [48, 80],
  iconAnchor: [24, 80],
  popupAnchor: [0, -80],
})

// Auto-fit map to show both pins
const FitBounds = ({ positions }) => {
  const map = useMap()
  useEffect(() => {
    if (positions.length >= 2) {
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [60, 60] })
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

// Instant straight line — shows immediately
const getInstantRoute = (fromLat, fromLng, toLat, toLng) => {
  return [[fromLat, fromLng], [toLat, toLng]]
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
  const { user } = useAuth()
  const [workerPos, setWorkerPos] = useState(null)
  const [route, setRoute] = useState([])
  const [eta, setEta] = useState(null)
  const [distance, setDistance] = useState(null)
  const [tracking, setTracking] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [watchId, setWatchId] = useState(null)
  const channelRef = useRef()

  const destLat = parseFloat(gig.latitude)
  const destLng = parseFloat(gig.longitude)
  const hasDestination = !isNaN(destLat) && !isNaN(destLng)

  useEffect(() => {
    if (role === 'poster') {
      // Poster subscribes to worker location updates
      subscribeToWorkerLocation()
    }
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (watchId) navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  useEffect(() => {
    if (workerPos && hasDestination) {
      updateRoute()
      const dist = getDistance(
        workerPos[0], workerPos[1], destLat, destLng
      )
      setDistance(dist)
      // Check if arrived (within 50 meters)
      if (dist < 0.05) setArrived(true)
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
        if (payload.new) {
          setWorkerPos([
            parseFloat(payload.new.latitude),
            parseFloat(payload.new.longitude)
          ])
          setTracking(true)
        }
      })
      .subscribe()

    // Also fetch latest position
    fetchWorkerLocation()
  }

  const fetchWorkerLocation = async () => {
    const { data } = await supabase
      .from('worker_locations')
      .select('*')
      .eq('gig_id', gig.id)
      .eq('is_active', true)
      .maybeSingle()
    if (data) {
      setWorkerPos([parseFloat(data.latitude), parseFloat(data.longitude)])
      setTracking(true)
    }
  }

  const updateRoute = async () => {
    if (!workerPos || !hasDestination) return
    const result = await getRoute(workerPos[0], workerPos[1], destLat, destLng)
    if (result) {
      setRoute(result.coords)
      setEta(result.duration)
    } else if (distance) {
      setEta(Math.round(distance / 0.5))
    }
  }

  const startTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device')
      return
    }

    setTracking(true)

    // Notify poster
    supabase.from('notifications').insert({
      user_id: gig.poster_id,
      title: '🚀 Worker is on the way!',
      message: `Your worker has started heading to "${gig.title}"`,
      type: 'general',
      gig_id: gig.id
    })

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        setWorkerPos([lat, lng])

        // Update location in database
        await supabase
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
      },
      (err) => console.log('Location error:', err),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    )

    setWatchId(id)
  }

  const stopTracking = async () => {
    if (watchId) navigator.geolocation.clearWatch(watchId)
    setTracking(false)
    setWatchId(null)

    await supabase
      .from('worker_locations')
      .update({ is_active: false })
      .eq('gig_id', gig.id)
      .eq('worker_id', user.id)
  }

  const markArrived = async () => {
    await stopTracking()
    setArrived(true)

    await supabase.from('notifications').insert({
      user_id: gig.poster_id,
      title: '📍 Worker has arrived!',
      message: `Your worker has arrived at "${gig.title}"`,
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
      background: '#fff',
      zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      touchAction: 'none'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '0 0 20px 20px',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexShrink: 0,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div>
          <div style={{
            fontSize: '10px', color: '#6C47FF', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px'
          }}>
            {role === 'worker' ? '🧭 Navigation' : '📍 Live Tracking'}
          </div>
          <div style={{
            fontSize: '15px', fontWeight: '800', color: '#14123A'
          }}>{gig.title}</div>
        </div>
        <button onClick={onClose} style={{
          background: '#F5F4FF', border: '1.5px solid #E2E0FF',
          borderRadius: '10px', width: '36px', height: '36px',
          fontSize: '18px', color: '#8B8FAF', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit'
        }}>×</button>
      </div>

      {/* Stats Bar */}
      {(eta || distance) && (
        <div style={{
          background: '#fff',
          padding: '10px 20px',
          display: 'flex', gap: '12px',
          borderBottom: '1px solid #F5F4FF', flexShrink: 0
        }}>
          {eta && (
            <div style={{
              background: '#EEE9FF', borderRadius: '10px',
              padding: '8px 14px', textAlign: 'center'
            }}>
              <div style={{
                fontSize: '16px', fontWeight: '800', color: '#6C47FF'
              }}>{eta} min</div>
              <div style={{
                fontSize: '9px', color: '#A09DC8',
                fontWeight: '600', textTransform: 'uppercase'
              }}>ETA</div>
            </div>
          )}
          {distance && (
            <div style={{
              background: '#F5F4FF', borderRadius: '10px',
              padding: '8px 14px', textAlign: 'center'
            }}>
              <div style={{
                fontSize: '16px', fontWeight: '800', color: '#14123A'
              }}>
                {distance < 1
                  ? `${Math.round(distance * 1000)}m`
                  : `${distance.toFixed(1)}km`}
              </div>
              <div style={{
                fontSize: '9px', color: '#A09DC8',
                fontWeight: '600', textTransform: 'uppercase'
              }}>Distance</div>
            </div>
          )}
          {arrived && (
            <div style={{
              background: '#DFFDF4', border: '1.5px solid #7EECD2',
              borderRadius: '10px', padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <span style={{ fontSize: '16px' }}>✅</span>
              <div style={{
                fontSize: '13px', fontWeight: '700', color: '#00C48C'
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
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
          />

          {allPositions.length >= 2 && <FitBounds positions={allPositions} />}

          {/* Worker pin */}
          {workerPos && (
            <Marker
              position={workerPos}
              icon={createWorkerPin(
                workerInfo?.avatar_url,
                workerInfo?.full_name?.charAt(0) || '?'
              )}>
              <Popup>
                <div style={{ fontFamily: 'inherit', fontSize: '13px' }}>
                  <strong>{workerInfo?.full_name || 'Worker'}</strong>
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
                posterInfo?.avatar_url,
                posterInfo?.full_name?.charAt(0) || '📍'
              )}>
              <Popup>
                <div style={{ fontFamily: 'inherit', fontSize: '13px' }}>
                  <strong>📍 {gig.location || 'Destination'}</strong>
                  {posterInfo?.full_name && (
                    <><br />{posterInfo.full_name}</>
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
                color="#6C47FF"
                weight={5}
                opacity={0.9}
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
            background: '#fff', borderRadius: '16px',
            padding: '20px 24px', textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            zIndex: 1000, maxWidth: '280px'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{
              fontSize: '14px', fontWeight: '700',
              color: '#14123A', marginBottom: '4px'
            }}>No exact location set</div>
            <div style={{ fontSize: '12px', color: '#A09DC8', lineHeight: '1.5' }}>
              The poster didn't set an exact address for this gig.
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div style={{
        background: '#fff',
        borderTop: '1.5px solid #E2E0FF',
        padding: '16px 20px',
        flexShrink: 0
      }}>
        {role === 'worker' && !arrived && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!tracking ? (
              <button
                onClick={startTracking}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  border: 'none', borderRadius: '14px', padding: '15px',
                  fontSize: '15px', fontWeight: '700', color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.4)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '8px'
                }}>
                <span>🧭</span> Start Navigation
              </button>
            ) : (
              <>
                <div style={{
                  background: '#DFFDF4', border: '1.5px solid #7EECD2',
                  borderRadius: '12px', padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: '#00C48C', animation: 'blink 1s infinite'
                  }} />
                  <div>
                    <div style={{
                      fontSize: '13px', fontWeight: '700', color: '#00C48C'
                    }}>Live tracking active</div>
                    <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                      Client can see your location
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={markArrived}
                    style={{
                      flex: 2,
                      background: 'linear-gradient(135deg, #00C48C, #00A878)',
                      border: 'none', borderRadius: '12px', padding: '13px',
                      fontSize: '14px', fontWeight: '700', color: '#fff',
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px'
                    }}>
                    <span>📍</span> I've Arrived
                  </button>
                  <button
                    onClick={stopTracking}
                    style={{
                      flex: 1, background: '#FFE8EE',
                      border: '1.5px solid #FF99B3',
                      borderRadius: '12px', padding: '13px',
                      fontSize: '13px', fontWeight: '700',
                      color: '#FF3366', cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}>Stop</button>
                </div>
              </>
            )}
          </div>
        )}

        {role === 'poster' && (
          <div>
            {!tracking ? (
              <div style={{
                textAlign: 'center', padding: '8px',
                display: 'flex', gap: '10px',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#A09DC8'
                }} />
                <span style={{
                  fontSize: '13px', color: '#A09DC8', fontWeight: '500'
                }}>
                  Waiting for worker to start navigation...
                </span>
              </div>
            ) : arrived ? (
              <div style={{
                background: '#DFFDF4', border: '1.5px solid #7EECD2',
                borderRadius: '12px', padding: '14px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>✅</div>
                <div style={{
                  fontSize: '14px', fontWeight: '700', color: '#00C48C'
                }}>Worker has arrived!</div>
              </div>
            ) : (
              <div style={{
                background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                borderRadius: '12px', padding: '14px',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: '#6C47FF', animation: 'blink 1s infinite',
                  flexShrink: 0
                }} />
                <div>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: '#6C47FF'
                  }}>
                    {workerInfo?.full_name?.split(' ')[0] || 'Worker'} is on the way
                  </div>
                  {eta && (
                    <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                      Estimated arrival: {eta} minutes
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {arrived && role === 'worker' && (
          <div style={{
            background: '#DFFDF4', border: '1.5px solid #7EECD2',
            borderRadius: '12px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
            <div style={{
              fontSize: '15px', fontWeight: '700',
              color: '#00C48C', marginBottom: '4px'
            }}>You've arrived!</div>
            <div style={{ fontSize: '12px', color: '#8B8FAF' }}>
              Client has been notified. Start the work!
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .leaflet-container {
          touch-action: pan-x pan-y pinch-zoom !important;
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