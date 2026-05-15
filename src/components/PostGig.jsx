import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import CategoryPicker from './CategoryPicker'
import BrandIcon from './BrandIcon'
import { playAccepted } from '../utils/sounds'
import { getProfileCompletion } from '../utils/profileComplete'
import ProfilePrompt from './ProfilePrompt'
import { CURRENCIES } from '../data/currencies'
import { useLanguage } from '../context/LanguageContext'

const URGENCY = [
  { key: 'now', label: 'NOW', color: '#FF3366', bg: '#FFE8EE' },
  { key: 'today', label: 'TODAY', color: '#FF6B2B', bg: '#FFF0E8' },
  { key: 'scheduled', label: 'SCHEDULED', color: '#6C47FF', bg: '#EEE9FF' },
  { key: 'flexible', label: 'FLEXIBLE', color: '#A09DC8', bg: '#F5F4FF' },
]

export default function PostGig({ onClose }) {
  const { user, profile } = useAuth()
  const { currency: defaultCurrency } = useLanguage()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')
  const [locationResults, setLocationResults] = useState([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationSelected, setLocationSelected] = useState(false)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  const [form, setForm] = useState({
    title: '',
    type: 'physical',
    field: '',
    custom_skill: '',
    urgency: 'now',
    pay_min: '',
    pay_max: '',
    currency: defaultCurrency || 'USD',
    duration_days: 1,
    location: '',
    latitude: null,
    longitude: null,
    slots: 1,
    description: '',
    house_number: '',
    street: '',
    landmark: '',
    directions: '',
  })

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Get coordinates from location name
  const geocodeLocation = async (locationName) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'PrimaApp/1.0'
        }
      }
    )
    const data = await response.json()
    console.log('Geocode result:', data)
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      }
    }
  } catch (e) {
    console.log('Geocoding error:', e)
  }
  return null
}

  const handleSubmit = async () => {
    const { complete } = getProfileCompletion(profile)
    if (!complete) {
      setShowPrompt(true)
      return
    }
    if (!form.title || !form.pay_min || !form.pay_max) {
      setError('Please fill in title and pay range')
      return
    }
    setLoading(true)
    setError('')

    let lat = form.latitude
    let lng = form.longitude

    // Auto geocode location to coordinates
    if (form.type === 'physical' && form.location && !lat) {
      const coords = await geocodeLocation(form.location)
      if (coords) { lat = coords.lat; lng = coords.lng }
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + form.duration_days)

    const { error: err } = await supabase.from('gigs').insert({
  poster_id: user.id,
  title: form.title,
  description: form.description,
  type: form.type,
  field: form.field,
  urgency: form.urgency,
  pay_min: parseFloat(form.pay_min),
  pay_max: parseFloat(form.pay_max),
  currency: form.currency,
  duration_days: form.duration_days,
  expires_at: expiresAt.toISOString(),
  location: form.location,
  latitude: lat,
  longitude: lng,
  slots: form.slots,
  status: 'open',
  custom_skill: form.custom_skill,
  house_number: form.house_number,
  street: form.street,
  landmark: form.landmark,
  directions: form.directions,
})

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    playAccepted()
    setDone(true)
    setLoading(false)
    setTimeout(() => {
  onClose()
  window.location.reload()
}, 2000)
  }

  const inputStyle = {
    width: '100%',
    background: '#F5F4FF',
    border: '1.5px solid #E2E0FF',
    borderRadius: '10px',
    padding: '12px 14px',
    fontSize: '14px',
    color: '#14123A',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    fontSize: '11px',
    fontWeight: '700',
    color: '#8B8FAF',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    display: 'block',
    marginBottom: '7px'
  }

  return (
    <>
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff',
        borderRadius: '24px',
        padding: '28px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '88vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        border: '1.5px solid #E2E0FF',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>

        {done ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <BrandIcon name="discover" size={64} />
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#6C47FF', marginBottom: '8px' }}>
              Gig Posted!
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', lineHeight: '1.6' }}>
              Your gig is now live on the Prima map. Workers nearby are being notified.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#6C47FF', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '3px' }}>
                  Post a Gig · Step {step} of 3
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A' }}>
                  {step === 1 ? 'What do you need?' : step === 2 ? 'Details & Pay' : 'Review & Post'}
                </div>
              </div>
              <button onClick={onClose} style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '8px', width: '34px', height: '34px',
                fontSize: '18px', color: '#8B8FAF', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit'
              }}>×</button>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{
                  flex: 1, height: '3px', borderRadius: '2px',
                  background: s <= step ? '#6C47FF' : '#E2E0FF',
                  transition: 'background 0.3s'
                }} />
              ))}
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Gig Title</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. Need a photographer for product shoot"
                    value={form.title}
                    onChange={e => update('title', e.target.value)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Work Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {['physical', 'digital'].map(t => (
                      <div key={t} onClick={() => update('type', t)} style={{
                        background: form.type === t ? (t === 'physical' ? '#FFF0E8' : '#EEE9FF') : '#F5F4FF',
                        border: `1.5px solid ${form.type === t ? (t === 'physical' ? '#FFBC99' : '#B8A5FF') : '#E2E0FF'}`,
                        borderRadius: '14px', padding: '16px 12px',
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                          <BrandIcon name={t === 'physical' ? 'physical' : 'digital'} size={42} active={form.type === t} />
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A', textTransform: 'capitalize' }}>{t}</div>
                        <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '2px' }}>
                          {t === 'physical' ? 'On-location work' : 'Remote / online'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Field / Category</label>
                  <CategoryPicker
                    selected={form.field}
                    onSelect={(field) => update('field', field)}
                    customSkill={form.custom_skill}
                    onCustomSkill={(val) => update('custom_skill', val)}
                  />
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Urgency */}
                <div>
                  <label style={labelStyle}>Urgency</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {URGENCY.map(u => (
                      <button key={u.key} onClick={() => update('urgency', u.key)} style={{
                        flex: 1,
                        background: form.urgency === u.key ? u.bg : 'transparent',
                        border: `1.5px solid ${form.urgency === u.key ? u.color : '#E2E0FF'}`,
                        borderRadius: '8px', padding: '9px 4px',
                        fontSize: '9px', fontWeight: '800',
                        letterSpacing: '0.6px',
                        color: form.urgency === u.key ? u.color : '#A09DC8',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                      }}>{u.label}</button>
                    ))}
                  </div>
                </div>

                {/* Currency + Duration row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <select
                      value={form.currency}
                      onChange={e => update('currency', e.target.value)}
                      style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Duration</label>
                    <select
                      value={form.duration_days}
                      onChange={e => update('duration_days', parseInt(e.target.value))}
                      style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                      {[1, 2, 3, 4, 5].map(d => (
                        <option key={d} value={d}>
                          {d} day{d !== 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pay Range */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Min Pay ({CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'})</label>
                    <input
                      style={inputStyle} type="number"
                      placeholder="e.g. 80"
                      value={form.pay_min}
                      onChange={e => update('pay_min', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Max Pay ({CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'})</label>
                    <input
                      style={inputStyle} type="number"
                      placeholder="e.g. 160"
                      value={form.pay_max}
                      onChange={e => update('pay_max', e.target.value)}
                    />
                  </div>
                </div>

                {/* Location — only for physical gigs */}
                {form.type === 'physical' && (
                  <div>
                    <label style={labelStyle}>
                      General Area
                      <span style={{
                        marginLeft: '6px', fontSize: '10px',
                        color: '#A09DC8', fontWeight: '500',
                        textTransform: 'none', letterSpacing: 0
                      }}>— shown publicly on map</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{
                          ...inputStyle,
                          paddingRight: locationLoading ? '40px' : '14px'
                        }}
                        placeholder="Search city, island, area..."
                        value={locationSearch}
                        onChange={(e) => {
                          const val = e.target.value
                          setLocationSearch(val)
                          setLocationSelected(false)
                          update('location', '')
                          update('latitude', null)
                          update('longitude', null)

                          if (val.length < 3) {
                            setLocationResults([])
                            setLocationLoading(false)
                            return
                          }

                          // Cancel previous request
                          if (abortRef.current) abortRef.current.abort()
                          // Clear previous debounce
                          if (debounceRef.current) clearTimeout(debounceRef.current)

                          setLocationLoading(true)
                          debounceRef.current = setTimeout(async () => {
                            abortRef.current = new AbortController()
                            try {
                              const res = await fetch(
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&addressdetails=1`,
                                {
                                  headers: { 'Accept-Language': 'en', 'User-Agent': 'PrimaApp/1.0' },
                                  signal: abortRef.current.signal
                                }
                              )
                              const data = await res.json()
                              setLocationResults(data)
                            } catch (e) {
                              if (e.name !== 'AbortError') console.log('Search error:', e)
                            }
                            setLocationLoading(false)
                          }, 400)
                        }}
                      />

                      {locationLoading && (
                        <div style={{
                          position: 'absolute', right: '12px',
                          top: '50%', transform: 'translateY(-50%)',
                          fontSize: '14px'
                        }}>⏳</div>
                      )}

                      {locationSelected && (
                        <div style={{
                          position: 'absolute', right: '12px',
                          top: '50%', transform: 'translateY(-50%)',
                          fontSize: '16px', color: '#00C48C'
                        }}>✓</div>
                      )}

                      {locationResults.length > 0 && !locationSelected && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          background: '#fff', border: '1.5px solid #B8A5FF',
                          borderRadius: '12px', marginTop: '4px',
                          zIndex: 100, overflow: 'hidden',
                          boxShadow: '0 8px 32px rgba(108,71,255,0.15)'
                        }}>
                          {locationResults.map((result, i) => {
                            const city = result.address?.city
                              || result.address?.town
                              || result.address?.village
                              || result.address?.county || ''
                            const country = result.address?.country || ''
                            const state = result.address?.state || ''
                            const shortName = [city, state, country]
                              .filter(Boolean).join(', ')
                            return (
                              <div key={i}
                                onClick={() => {
                                  const name = shortName || result.display_name
                                  setLocationSearch(name)
                                  setLocationResults([])
                                  setLocationSelected(true)
                                  update('location', name)
                                  update('latitude', parseFloat(result.lat))
                                  update('longitude', parseFloat(result.lon))
                                }}
                                style={{
                                  padding: '11px 14px', cursor: 'pointer',
                                  borderBottom: i < locationResults.length - 1
                                    ? '1px solid #F5F4FF' : 'none',
                                  display: 'flex', gap: '8px', alignItems: 'flex-start'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                              >
                                <BrandIcon name="location" size={28} />
                                <div>
                                  <div style={{
                                    fontSize: '13px', fontWeight: '600',
                                    color: '#14123A', marginBottom: '1px'
                                  }}>
                                    {shortName || result.display_name.split(',')[0]}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                                    {result.display_name.length > 55
                                      ? result.display_name.substring(0, 55) + '...'
                                      : result.display_name}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {locationSelected && (
                      <div style={{
                        fontSize: '11px', color: '#00C48C',
                        marginTop: '5px', display: 'flex',
                        alignItems: 'center', gap: '4px'
                      }}>✓ Pin placed on map</div>
                    )}

                    {/* Exact Address */}
                    {locationSelected && (
                      <div style={{
                        background: '#F5F4FF', borderRadius: '14px',
                        padding: '16px', border: '1.5px solid #E2E0FF',
                        display: 'flex', flexDirection: 'column',
                        gap: '12px', marginTop: '12px'
                      }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <BrandIcon name="lock" size={34} />
                          <div>
                            <div style={{
                              fontSize: '12px', fontWeight: '700', color: '#14123A'
                            }}>Exact Address</div>
                            <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '1px' }}>
                              Only shared with accepted workers
                            </div>
                          </div>
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>
                            House / Building Number
                          </label>
                          <input
                            style={{ ...inputStyle, background: '#fff' }}
                            placeholder="e.g. 12, Flat 3B..."
                            value={form.house_number || ''}
                            onChange={e => update('house_number', e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>Street Name</label>
                          <input
                            style={{ ...inputStyle, background: '#fff' }}
                            placeholder="e.g. Adeola Odeku Street"
                            value={form.street || ''}
                            onChange={e => update('street', e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>
                            Nearest Landmark
                          </label>
                          <input
                            style={{ ...inputStyle, background: '#fff' }}
                            placeholder="e.g. Beside First Bank..."
                            value={form.landmark || ''}
                            onChange={e => update('landmark', e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>
                            Additional Directions (optional)
                          </label>
                          <textarea
                            style={{
                              ...inputStyle, background: '#fff',
                              minHeight: '60px', resize: 'vertical'
                            }}
                            placeholder="e.g. Take the gate on the left..."
                            value={form.directions || ''}
                            onChange={e => update('directions', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Slots */}
                <div>
                  <label style={labelStyle}>Open Slots</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => update('slots', n)} style={{
                        width: '40px', height: '40px',
                        background: form.slots === n ? '#EEE9FF' : '#F5F4FF',
                        border: `1.5px solid ${form.slots === n ? '#B8A5FF' : '#E2E0FF'}`,
                        borderRadius: '9px', fontSize: '14px', fontWeight: '700',
                        color: form.slots === n ? '#6C47FF' : '#8B8FAF',
                        cursor: 'pointer', fontFamily: 'inherit'
                      }}>{n}</button>
                    ))}
                    <button onClick={() => update('slots', 10)} style={{
                      padding: '0 12px', height: '40px',
                      background: form.slots === 10 ? '#EEE9FF' : '#F5F4FF',
                      border: `1.5px solid ${form.slots === 10 ? '#B8A5FF' : '#E2E0FF'}`,
                      borderRadius: '9px', fontSize: '11px', fontWeight: '700',
                      color: form.slots === 10 ? '#6C47FF' : '#8B8FAF',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>10+</button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description (optional)</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    placeholder="Describe what you need, requirements, timeline..."
                    value={form.description}
                    onChange={e => update('description', e.target.value)}
                  />
                </div>

              </div>
            )}

            {/* STEP 3 - Review */}
            {step === 3 && (
              <div>
                <div style={{
                  background: '#F5F4FF',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  border: '1.5px solid #E2E0FF',
                  marginBottom: '16px'
                }}>
                  {[
                    ['Title', form.title || '—'],
                    ['Type', form.type],
                    ['Field', form.field],
                    ['Urgency', form.urgency.toUpperCase()],
                    ['Pay Range', `$${form.pay_min || '?'} – $${form.pay_max || '?'}`],
                    ['Location', form.type === 'digital' ? 'Remote' : (form.location || '—')],
                    ['Slots', form.slots],
                  ].map(([k, v]) => (
                    <div key={k} style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '11px 16px',
                      borderBottom: '1px solid #E2E0FF',
                      fontSize: '13px'
                    }}>
                      <span style={{ color: '#8B8FAF' }}>{k}</span>
                      <span style={{ fontWeight: '700', color: '#14123A', textTransform: 'capitalize' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{
                  background: '#EEE9FF',
                  border: '1.5px solid #B8A5FF',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '20px'
                }}>
                  <BrandIcon name="lock" size={34} />
                  <div style={{ fontSize: '12px', color: '#6C47FF', lineHeight: '1.6' }}>
                    Both parties confirm completion by uploading receipts with their names. This protects everyone involved.
                  </div>
                </div>

                {error && (
                  <div style={{
                    background: '#FFE8EE', border: '1.5px solid #FF99B3',
                    borderRadius: '8px', padding: '10px 14px',
                    fontSize: '13px', color: '#FF3366', marginBottom: '16px'
                  }}>{error}</div>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              {step > 1 && (
                <button onClick={() => setStep(s => s - 1)} style={{
                  flex: 1, background: '#F5F4FF',
                  border: '1.5px solid #E2E0FF',
                  borderRadius: '12px', padding: '14px',
                  fontSize: '13px', fontWeight: '600',
                  color: '#8B8FAF', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>← Back</button>
              )}
              <button
                onClick={step < 3 ? () => setStep(s => s + 1) : handleSubmit}
                disabled={loading}
                style={{
                  flex: 2,
                  background: loading ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  border: 'none', borderRadius: '12px',
                  padding: '14px', fontSize: '14px',
                  fontWeight: '700', color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
                  fontFamily: 'inherit', transition: 'all 0.2s'
                }}>
                {loading ? '⏳ Posting...' : step < 3 ? 'Continue →' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <BrandIcon name="post" size={26} />
                    Go Live
                  </span>
                )}
              </button>
            </div>
          </>
        )}

        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>

    {showPrompt && (
      <ProfilePrompt
        profile={profile}
        onClose={() => setShowPrompt(false)}
        onGoToProfile={() => {
          setShowPrompt(false)
          onClose()
          window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
        }}
      />
    )}
    </>
  )
}
