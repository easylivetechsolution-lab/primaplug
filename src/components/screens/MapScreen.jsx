import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../supabase'

// Fix default marker icon issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom colored pin
const createPin = (color) => L.divIcon({
  className: '',
  html: `
    <div style="
      position:relative;
      display:flex;
      flex-direction:column;
      align-items:center;
    ">
      <div style="
        width:38px;height:38px;
        background:${color};
        border-radius:50%;
        border:3px solid #fff;
        box-shadow:0 4px 16px ${color}88;
        display:flex;align-items:center;
        justify-content:center;
        font-size:16px;
      ">📌</div>
      <div style="
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:8px solid ${color};
        margin-top:-2px;
      "></div>
    </div>
  `,
  iconSize: [38, 50],
  iconAnchor: [19, 50],
  popupAnchor: [0, -52],
})

const URGENCY_COLORS = {
  now: '#FF3366',
  today: '#FF6B2B',
  scheduled: '#6C47FF',
  flexible: '#A09DC8'
}

// User location marker
const UserMarker = ({ position }) => {
  const icon = L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          position:absolute;
          width:40px;height:40px;
          border-radius:50%;
          background:rgba(108,71,255,0.2);
          animation:ripple 2s ease-out infinite;
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
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
  return <Marker position={position} icon={icon} />
}

// Auto center map on user location
const SetView = ({ coords }) => {
  const map = useMap()
  useEffect(() => {
    if (coords) map.setView(coords, 13)
  }, [coords])
  return null
}

export default function MapScreen() {
  const [gigs, setGigs] = useState([])
  const [userPos, setUserPos] = useState([6.5244, 3.3792]) // Default Lagos
  const [liveCount, setLiveCount] = useState(312)
  const [nowCount, setNowCount] = useState(17)
  const [selectedGig, setSelectedGig] = useState(null)

  // Get user location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => console.log('Location access denied, using default')
    )
  }, [])

  // Fetch gigs from Supabase
  useEffect(() => {
    fetchGigs()
    // Real-time subscription
    const channel = supabase
      .channel('gigs-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gigs'
      }, () => fetchGigs())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const fetchGigs = async () => {
    const { data } = await supabase
      .from('gigs')
      .select(`*, users(full_name, trust_score, avatar_url)`)
      .eq('status', 'open')
      .eq('type', 'physical')
      .not('latitude', 'is', null)
    if (data) setGigs(data)
  }

  // Live counter animation
  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(c => c + (Math.random() > 0.6 ? Math.round(Math.random() * 4 - 2) : 0))
      setNowCount(c => Math.max(8, c + (Math.random() > 0.75 ? Math.round(Math.random() * 3 - 1) : 0)))
    }, 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Live Stats Bar */}
      <div style={{
        position: 'absolute', top: '14px', left: '14px',
        display: 'flex', gap: '8px', zIndex: 1000
      }}>
        <div style={{
          background: 'rgba(13,27,62,0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: '20px', padding: '6px 13px',
          display: 'flex', alignItems: 'center', gap: '6px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#FF3366', animation: 'blink 0.9s infinite'
          }}/>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#fff' }}>
            {nowCount} NOW
          </span>
        </div>
        <div style={{
          background: 'rgba(13,27,62,0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: '20px', padding: '6px 13px',
          display: 'flex', alignItems: 'center', gap: '6px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00C48C' }}/>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#fff' }}>
            {liveCount} live
          </span>
        </div>
      </div>

       {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={userPos}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
          />
          <SetView coords={userPos} />
          <UserMarker position={userPos} />
          {gigs.map(gig => (
            <Marker
              key={gig.id}
              position={[gig.latitude, gig.longitude]}
              icon={createPin(URGENCY_COLORS[gig.urgency] || '#6C47FF')}
              eventHandlers={{ click: () => setSelectedGig(gig) }}
            >
              <Popup>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: '180px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>{gig.title}</div>
                  <div style={{ fontSize: '12px', color: '#6C47FF', fontWeight: '700', marginBottom: '4px' }}>
                    ${gig.pay_min} – ${gig.pay_max}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{gig.location}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Now Strip */}
      <div style={{
        background: '#fff',
        borderTop: '1.5px solid #E2E0FF',
        padding: '12px 16px 0'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#A09DC8', letterSpacing: '1px' }}>
            HAPPENING NOW
          </span>
          <span style={{ fontSize: '11px', color: '#6C47FF', fontWeight: '600', cursor: 'pointer' }}>
            See all →
          </span>
        </div>
        {gigs.length === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#A09DC8',
            fontSize: '13px',
            marginBottom: '16px'
          }}>
            No live gigs yet — be the first to post one! 🚀
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: '12px',
            overflowX: 'auto', paddingBottom: '16px',
            scrollbarWidth: 'none'
          }}>
            {gigs.slice(0, 6).map(gig => (
              <div key={gig.id} onClick={() => setSelectedGig(gig)}
                style={{
                  background: '#F5F4FF',
                  borderRadius: '14px',
                  padding: '14px',
                  minWidth: '190px',
                  border: '1.5px solid #E2E0FF',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s'
                }}>
                <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', lineHeight: '1.3' }}>
                  {gig.title}
                </div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#00C48C' }}>
                  ${gig.pay_min}–${gig.pay_max}
                </div>
                <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '4px' }}>
                  {gig.location}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .leaflet-container {
          font-family: 'Plus Jakarta Sans', sans-serif !important;
        }
      `}</style>
    </div>
  )
}