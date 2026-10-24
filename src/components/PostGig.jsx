import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import CategoryPicker from './CategoryPicker'
import BrandIcon from './BrandIcon'
import { showToast } from '../utils/toast'
import { playAccepted } from '../utils/sounds'
import { getProfileCompletion } from '../utils/profileComplete'
import ProfilePrompt from './ProfilePrompt'
import { CURRENCIES, FINCRA_CURRENCIES } from '../data/currencies'
import { useLanguage } from '../context/LanguageContext'
import { currencyForLocation } from '../utils/locationCurrency'
import { PAYMENT_METHODS } from '../utils/payments'
import { startFincraWalletFunding } from '../utils/fincra'

const URGENCY = [
  { key: 'now', label: 'NOW', color: 'var(--color-danger)', bg: 'var(--color-danger-soft)' },
  { key: 'today', label: 'TODAY', color: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
  { key: 'scheduled', label: 'SCHEDULED', color: 'var(--color-brand)', bg: 'var(--color-brand-soft)' },
  { key: 'flexible', label: 'FLEXIBLE', color: 'var(--color-text-subtle)', bg: 'var(--color-page)' },
]

export default function PostGig({ onClose }) {
  const { user, profile, wallets } = useAuth()
  const { currency: defaultCurrency } = useLanguage()
  const locationCurrency = currencyForLocation(profile?.location, defaultCurrency || 'USD')
  const supportedGigCurrencies = FINCRA_CURRENCIES
    .map(code => CURRENCIES.find(currency => currency.code === code))
    .filter(Boolean)
  const initialGigCurrency = FINCRA_CURRENCIES.includes(locationCurrency)
    ? locationCurrency
    : FINCRA_CURRENCIES.includes(String(defaultCurrency || '').toUpperCase())
      ? String(defaultCurrency).toUpperCase()
      : 'USD'
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const submittingRef = useRef(false)
  const [showQuickFund, setShowQuickFund] = useState(false)
  const [quickFundAmount, setQuickFundAmount] = useState('')
  const [quickFunding, setQuickFunding] = useState(false)
  const [quickFundError, setQuickFundError] = useState('')

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

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
    currency: initialGigCurrency,
    duration_days: 1,
    expires_on: '',
    location: '',
    latitude: null,
    longitude: null,
    slots: 1,
    description: '',
    house_number: '',
    street: '',
    landmark: '',
    directions: '',
    payment_method: PAYMENT_METHODS.MANUAL,
  })

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  useEffect(() => {
  const saved = sessionStorage.getItem('prima_postgig_resume')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      const restoredCurrency = String(parsed.currency || '').toUpperCase()
      setForm(f => ({
        ...f,
        ...parsed,
        currency: FINCRA_CURRENCIES.includes(restoredCurrency) ? restoredCurrency : initialGigCurrency,
      }))
      setLocationSearch(parsed.location || '')
      setLocationSelected(Boolean(parsed.location))
      setStep(3)
    } catch {}
    sessionStorage.removeItem('prima_postgig_resume')
  }
}, [])

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

  const validateStep = (stepToValidate) => {
    if (stepToValidate === 1) {
      if (!form.title.trim()) return 'Add a title for this gig.'
      if (!form.field && !form.custom_skill.trim()) return 'Choose a field or enter a custom skill.'
    }
    if (stepToValidate === 2) {
      const minPay = Number(form.pay_min)
      const maxPay = Number(form.pay_max)
      if (!FINCRA_CURRENCIES.includes(String(form.currency).toUpperCase())) {
        return 'Choose a supported gig currency.'
      }
      if (!Number.isFinite(minPay) || minPay <= 0 || !Number.isFinite(maxPay) || maxPay <= 0) {
        return 'Enter a minimum and maximum pay greater than zero.'
      }
      if (maxPay < minPay) return 'Maximum pay must be at least the minimum pay.'
      if (!Number.isInteger(Number(form.slots)) || Number(form.slots) < 1 || Number(form.slots) > 10) {
        return 'Choose between 1 and 10 open slots.'
      }
      if (!form.location.trim() || !locationSelected) {
        return 'Choose a location from the suggestions.'
      }
      if (form.expires_on) {
        const expiry = new Date(`${form.expires_on}T23:59:59`)
        if (!Number.isFinite(expiry.getTime()) || expiry < new Date()) return 'Choose a valid future expiry date.'
      }
    }
    return ''
  }

  const handleContinue = () => {
    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStep(current => current + 1)
  }

  const handleSubmit = async () => {
    if (loading || submittingRef.current) return
    const validationError = validateStep(1) || validateStep(2)
    if (validationError) {
      setError(validationError)
      return
    }

    const gigWalletForSubmit = (wallets || []).find(w => w.currency === form.currency)
    if (form.payment_method === PAYMENT_METHODS.WALLET && !gigWalletForSubmit) {
      setError(`Add a ${form.currency} wallet or choose manual payment.`)
      return
    }
    if (form.payment_method === PAYMENT_METHODS.WALLET && Number(form.pay_max) !== Number(form.pay_min)) {
      setError('Wallet payment settles at the minimum pay per worker. Set both pay amounts equal, or choose manual payment for a pay range.')
      return
    }
    if (form.payment_method === PAYMENT_METHODS.WALLET && Number(gigWalletForSubmit.balance || 0) < Number(form.pay_min)) {
      setError('Fund your wallet to cover the minimum escrow, or switch this gig to manual payment.')
      return
    }

    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('selfie_verified')
        .eq('id', user.id)
        .single()
      if (profileError) throw profileError
      if (!userProfile?.selfie_verified) {
        showToast('Please complete selfie verification in your profile before posting gigs.', 'error')
        onClose()
        window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'profile' }))
        return
      }

      const { complete } = getProfileCompletion(profile)
      if (!complete) {
        setShowPrompt(true)
        return
      }

      let lat = form.latitude
      let lng = form.longitude
      if (form.location && !lat) {
        const coords = await geocodeLocation(form.location)
        if (coords) { lat = coords.lat; lng = coords.lng }
      }

      const expiresAt = form.expires_on ? new Date(`${form.expires_on}T23:59:59`) : new Date()
      if (!form.expires_on) expiresAt.setDate(expiresAt.getDate() + 5)
      const { error: insertError } = await supabase.from('gigs').insert({
        poster_id: user.id,
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        field: form.field,
        urgency: form.urgency,
        pay_min: Number(form.pay_min),
        pay_max: Number(form.pay_max),
        currency: String(form.currency).toUpperCase(),
        duration_days: form.duration_days,
        expires_at: expiresAt.toISOString(),
        location: form.location.trim(),
        latitude: lat,
        longitude: lng,
        slots: Number(form.slots),
        status: 'open',
        custom_skill: form.custom_skill.trim(),
        house_number: form.house_number,
        street: form.street,
        landmark: form.landmark,
        directions: form.directions,
        payment_method: form.payment_method,
      })
      if (insertError) throw insertError

      playAccepted()
      setDone(true)
      setTimeout(() => {
        onClose()
        window.location.reload()
      }, 2000)
    } catch (submitError) {
      setError(submitError?.message || 'Could not post this gig. Please try again.')
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--color-page)',
    border: '1.5px solid var(--color-border)',
    borderRadius: '10px',
    padding: '12px 14px',
    fontSize: '16px',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
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
      <div className="post-gig-modal" onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-surface)',
        borderRadius: '24px',
        padding: '28px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '88vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        border: '1.5px solid var(--color-border)',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>

        {done ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <BrandIcon name="discover" size={64} />
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-brand)', marginBottom: '8px' }}>
              Gig Posted!
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
              Your gig is now live on the Prima map. Workers nearby are being notified.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '3px' }}>
                  Post a Gig · Step {step} of 3
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)' }}>
                  {step === 1 ? 'What do you need?' : step === 2 ? 'Details & Pay' : 'Review & Post'}
                </div>
              </div>
              <button  onClick={onClose} style={{
                background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                borderRadius: '8px', width: '34px', height: '34px',
                fontSize: '18px', color: 'var(--color-text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit'
              }}>×</button>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{
                  flex: 1, height: '3px', borderRadius: '2px',
                  background: s <= step ? 'var(--color-brand)' : 'var(--color-border)',
                  transition: 'background 0.3s'
                }} />
              ))}
            </div>

            {error && (
              <div role="alert" style={{
                background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: 'var(--color-danger)', marginBottom: '16px'
              }}>{error}</div>
            )}

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
                        background: form.type === t ? (t === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)') : 'var(--color-page)',
                        border: `1.5px solid ${form.type === t ? (t === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)') : 'var(--color-border)'}`,
                        borderRadius: '14px', padding: '16px 12px',
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                          <BrandIcon name={t === 'physical' ? 'physical' : 'digital'} size={42} active={form.type === t} />
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', textTransform: 'capitalize' }}>{t}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '2px' }}>
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
                        border: `1.5px solid ${form.urgency === u.key ? u.color : 'var(--color-border)'}`,
                        borderRadius: '8px', padding: '9px 4px',
                        fontSize: '12px', fontWeight: '800',
                        letterSpacing: '0.6px',
                        color: form.urgency === u.key ? u.color : 'var(--color-text-subtle)',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                      }}>{u.label}</button>
                    ))}
                  </div>
                </div>

                {/* Currency */}
                <div>
                  <label style={labelStyle}>Currency</label>
                  <select
                    value={form.currency}
                    onChange={e => update('currency', e.target.value)}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                    {supportedGigCurrencies.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} — {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Specific Expiry Date</label>
                  <input
                    type="date"
                    value={form.expires_on}
                    min={new Date().toISOString().slice(0, 10)}
                    max={new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                    onChange={e => update('expires_on', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Pay Range */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Min Pay ({CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'})</label>
                    <input
                      style={inputStyle} type="number"
                      min="0.01" step="0.01"
                      placeholder="e.g. 80"
                      value={form.pay_min}
                      onChange={e => update('pay_min', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Max Pay ({CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'})</label>
                    <input
                      style={inputStyle} type="number"
                      min="0.01" step="0.01"
                      placeholder="e.g. 160"
                      value={form.pay_max}
                      onChange={e => update('pay_max', e.target.value)}
                    />
                  </div>
                </div>

                {form.type === 'digital' && (
                  <div style={{
                    background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                    borderRadius: '12px', padding: '14px', marginBottom: '14px',
                    display: 'flex', gap: '10px', alignItems: 'center'
                  }}>
                    <BrandIcon name="location" size={36} active />
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                      Choose any area for the map pin. Digital work remains open to applicants worldwide.
                    </div>
                  </div>
                )}

                {/* Both physical and digital gigs can choose a map location. */}
                {(form.type === 'physical' || form.type === 'digital') && (
                  <div>
                    <label style={labelStyle}>
                      {form.type === 'physical' ? 'General Area' : 'Map Location'}
                      <span style={{
                        marginLeft: '6px', fontSize: '12px',
                        color: 'var(--color-text-subtle)', fontWeight: '500',
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
                          top: '50%', transform: 'translateY(-50%)'
                        }}>
                          <BrandIcon name="location" size={22} />
                        </div>
                      )}

                      {locationSelected && (
                        <div style={{
                          position: 'absolute', right: '12px',
                          top: '50%', transform: 'translateY(-50%)',
                          fontSize: '16px', color: 'var(--color-success)'
                        }}>✓</div>
                      )}

                      {locationResults.length > 0 && !locationSelected && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          background: 'var(--color-surface)', border: '1.5px solid var(--color-brand-border-strong)',
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
                                    ? '1px solid var(--color-page)' : 'none',
                                  display: 'flex', gap: '8px', alignItems: 'flex-start'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
                              >
                                <BrandIcon name="location" size={28} />
                                <div>
                                  <div style={{
                                    fontSize: '13px', fontWeight: '600',
                                    color: 'var(--color-text)', marginBottom: '1px'
                                  }}>
                                    {shortName || result.display_name.split(',')[0]}
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
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
                        fontSize: '13px', color: 'var(--color-success)',
                        marginTop: '5px', display: 'flex',
                        alignItems: 'center', gap: '4px'
                      }}>✓ Pin placed on map</div>
                    )}

                    {/* Exact address details apply only to physical gigs. */}
                    {form.type === 'physical' && locationSelected && (
                      <div style={{
                        background: 'var(--color-page)', borderRadius: '14px',
                        padding: '16px', border: '1.5px solid var(--color-border)',
                        display: 'flex', flexDirection: 'column',
                        gap: '12px', marginTop: '12px'
                      }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <BrandIcon name="lock" size={34} />
                          <div>
                            <div style={{
                              fontSize: '12px', fontWeight: '700', color: 'var(--color-text)'
                            }}>Exact Address</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '1px' }}>
                              Only shared with accepted workers
                            </div>
                          </div>
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '12px' }}>
                            House / Building Number
                          </label>
                          <input
                            style={{ ...inputStyle, background: 'var(--color-surface)' }}
                            placeholder="e.g. 12, Flat 3B..."
                            value={form.house_number || ''}
                            onChange={e => update('house_number', e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '12px' }}>Street Name</label>
                          <input
                            style={{ ...inputStyle, background: 'var(--color-surface)' }}
                            placeholder="e.g. Adeola Odeku Street"
                            value={form.street || ''}
                            onChange={e => update('street', e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '12px' }}>
                            Nearest Landmark
                          </label>
                          <input
                            style={{ ...inputStyle, background: 'var(--color-surface)' }}
                            placeholder="e.g. Beside First Bank..."
                            value={form.landmark || ''}
                            onChange={e => update('landmark', e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ ...labelStyle, fontSize: '12px' }}>
                            Additional Directions (optional)
                          </label>
                          <textarea
                            style={{
                              ...inputStyle, background: 'var(--color-surface)',
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
                        background: form.slots === n ? 'var(--color-brand-soft)' : 'var(--color-page)',
                        border: `1.5px solid ${form.slots === n ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                        borderRadius: '9px', fontSize: '14px', fontWeight: '700',
                        color: form.slots === n ? 'var(--color-brand)' : 'var(--color-text-muted)',
                        cursor: 'pointer', fontFamily: 'inherit'
                      }}>{n}</button>
                    ))}
                    <button onClick={() => update('slots', 10)} style={{
                      padding: '0 12px', height: '40px',
                      background: form.slots === 10 ? 'var(--color-brand-soft)' : 'var(--color-page)',
                      border: `1.5px solid ${form.slots === 10 ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                      borderRadius: '9px', fontSize: '13px', fontWeight: '700',
                      color: form.slots === 10 ? 'var(--color-brand)' : 'var(--color-text-muted)',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>10</button>
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
                  background: 'var(--color-page)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  border: '1.5px solid var(--color-border)',
                  marginBottom: '16px'
                }}>
                  {[
                    ['Title', form.title || '—'],
                    ['Type', form.type],
                    ['Field', form.field],
                    ['Urgency', form.urgency.toUpperCase()],
                    ['Pay Range', `${CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'}${form.pay_min || '?'} - ${CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'}${form.pay_max || '?'}`],
                    ['Payment', form.payment_method === PAYMENT_METHODS.WALLET ? 'Pay from Wallet' : 'Pay Manually'],
                    ['Expires', form.expires_on || '5 days from posting'],
                    ['Location', form.location || '—'],
                    ['Slots', form.slots],
                  ].map(([k, v]) => (
                    <div key={k} style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '11px 16px',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: '13px'
                    }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                      <span style={{ fontWeight: '700', color: 'var(--color-text)', textTransform: 'capitalize' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>How will you pay the worker?</label>

                  {form.payment_method === PAYMENT_METHODS.MANUAL && (
                    <div style={{
                      background: 'var(--color-brand-soft)',
                      border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      gap: '10px',
                      marginBottom: '12px'
                    }}>
                      <BrandIcon name="lock" size={34} />
                      <div style={{ fontSize: '12px', color: 'var(--color-brand)', lineHeight: '1.6' }}>
                        Both parties confirm completion by uploading receipts with their names. This protects everyone involved.
                      </div>
                    </div>
                  )}

                  {(() => {
                    const gigCurrencyFincraSupported = FINCRA_CURRENCIES.includes(form.currency)
                    const gigWallet = (wallets || []).find(w => w.currency === form.currency)
                    const walletMatchesGig = !!gigWallet
                    const walletEnabled = gigCurrencyFincraSupported && walletMatchesGig

                    return (
                      <>
                        {!gigCurrencyFincraSupported && (
                          <div style={{
                            background: 'var(--color-warning-gold-soft)', border: '1.5px solid var(--color-warning-gold-border)',
                            borderRadius: '12px', padding: '12px 14px',
                            fontSize: '12px', color: 'var(--color-warning-gold)',
                            lineHeight: '1.6', marginBottom: '12px',
                            display: 'flex', gap: '8px', alignItems: 'flex-start'
                          }}>
                            <BrandIcon name="lock" size={28} />
                            <div>
                              <strong>{form.currency}</strong> is not supported by Fincra for wallet payments.
                              Wallet payment is only available for {FINCRA_CURRENCIES.join(', ')} gigs.
                              This gig will use manual payment.
                            </div>
                          </div>
                        )}

                        {gigCurrencyFincraSupported && !walletMatchesGig && (
                          <div style={{
                            background: 'var(--color-warning-gold-soft)', border: '1.5px solid var(--color-warning-gold-border)',
                            borderRadius: '12px', padding: '12px 14px',
                            fontSize: '12px', color: 'var(--color-warning-gold)',
                            lineHeight: '1.6', marginBottom: '12px',
                            display: 'flex', gap: '8px', alignItems: 'flex-start'
                          }}>
                            <BrandIcon name="lock" size={28} />
                            <div>
                              You don't have a <strong>{form.currency}</strong> wallet yet.
                              Fund a {form.currency} wallet first, or use manual payment.
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          {[
                            {
                              key: PAYMENT_METHODS.WALLET,
                              title: 'Pay from Wallet',
                              desc: 'Worker gets 90%, or 85% if referred. Prima keeps 10%.',
                              tag: 'Recommended',
                              disabled: !walletEnabled,
                            },
                            {
                              key: PAYMENT_METHODS.MANUAL,
                              title: 'Pay Manually',
                              desc: 'Cash or transfer. A 10% fee is owed, plus 5% when the worker was referred.',
                              tag: 'Flexible',
                              disabled: false,
                            },
                          ].map(option => {
                            const active = form.payment_method === option.key
                            return (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                  if (option.disabled) return
                                  update('payment_method', option.key)
                                  setError('')
                                }}
                                style={{
                                  textAlign: 'left',
                                  background: option.disabled ? 'var(--color-surface-neutral)' : active ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                                  border: `1.5px solid ${option.disabled ? 'var(--color-border)' : active ? 'var(--color-brand)' : 'var(--color-border)'}`,
                                  borderRadius: '14px',
                                  padding: '14px',
                                  cursor: option.disabled ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                  opacity: option.disabled ? 0.55 : 1,
                                  position: 'relative'
                                }}
                              >
                                {option.disabled && option.key === PAYMENT_METHODS.WALLET && (
                                  <div style={{
                                    position: 'absolute', top: '8px', right: '8px',
                                    fontSize: '12px', fontWeight: '800',
                                    background: 'var(--color-border)', color: 'var(--color-text-muted)',
                                    borderRadius: '4px', padding: '2px 6px',
                                    letterSpacing: '0.5px'
                                  }}>UNAVAILABLE</div>
                                )}
                                <div style={{
                                  fontSize: '12px', fontWeight: '800',
                                  color: active && !option.disabled ? 'var(--color-brand)' : 'var(--color-text-subtle)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.8px',
                                  marginBottom: '6px'
                                }}>{option.tag}</div>
                                <div style={{
                                  fontSize: '13px', fontWeight: '800',
                                  color: 'var(--color-text)', marginBottom: '4px'
                                }}>{option.title}</div>
                                <div style={{
                                  fontSize: '13px', lineHeight: '1.5',
                                  color: active && !option.disabled ? 'var(--color-brand)' : 'var(--color-text-muted)'
                                }}>{option.desc}</div>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )
                  })()}

                  {form.payment_method === PAYMENT_METHODS.WALLET && (
                    <div style={{
                      marginTop: '10px',
                      background: Number((wallets || []).find(w => w.currency === form.currency)?.balance || 0) >= Number(form.pay_min || 0)
                        ? 'var(--color-success-soft)' : 'var(--color-warning-soft)',
                      border: `1.5px solid ${Number((wallets || []).find(w => w.currency === form.currency)?.balance || 0) >= Number(form.pay_min || 0)
                        ? 'var(--color-success-border)' : 'var(--color-warning-border)'}`,
                      borderRadius: '12px',
                      padding: '12px',
                      fontSize: '12px',
                      color: Number((wallets || []).find(w => w.currency === form.currency)?.balance || 0) >= Number(form.pay_min || 0)
                        ? 'var(--color-success)' : 'var(--color-warning)',
                      lineHeight: '1.6'
                    }}>
                      Wallet balance: {CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'}
                      {Number((wallets || []).find(w => w.currency === form.currency)?.balance || 0).toLocaleString()}.
                      {' '}Minimum escrow needed: {CURRENCIES.find(c => c.code === form.currency)?.symbol || '$'}
                      {Number(form.pay_min || 0).toLocaleString()}.
                      {' '}Wallet payment settles at the minimum amount for each worker. Set the minimum and maximum equal, or choose manual payment for a pay range.
                      {Number((wallets || []).find(w => w.currency === form.currency)?.balance || 0) < Number(form.pay_min || 0) && (
  <button
    type="button"
    className="pp-button"
    onClick={() => {
      const needed = Number(form.pay_min || 0) - Number((wallets || []).find(w => w.currency === form.currency)?.balance || 0)
      setQuickFundAmount(String(Math.ceil(needed)))
      setQuickFundError('')
      setShowQuickFund(true)
    }}
    style={{
      width: '100%',
      marginTop: '10px',
      background: 'var(--color-warning)',
      color: 'var(--color-surface)',
      border: 'none',
      borderRadius: '10px',
      padding: '10px',
                  fontSize: 'var(--font-size-control)',
      fontWeight: '800',
      cursor: 'pointer',
      fontFamily: 'inherit'
    }}
  >
    Fund Wallet
  </button>
)}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              {step > 1 && (
                <button className="pp-button pp-button--secondary" onClick={() => setStep(s => s - 1)} style={{
                  flex: 1, background: 'var(--color-page)',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: '12px', padding: '14px',
                  fontSize: 'var(--font-size-control)', fontWeight: '600',
                  color: 'var(--color-text-muted)', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>← Back</button>
              )}
              <button
                onClick={step < 3 ? handleContinue : handleSubmit}
                disabled={loading}
                className="pp-button pp-button--primary"
                style={{
                  flex: 2,
                  background: loading ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
                  border: 'none', borderRadius: '12px',
                  padding: '14px', minHeight: 'var(--control-height)', fontSize: '16px',
                  fontWeight: '700', color: 'var(--color-surface)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
                  fontFamily: 'inherit', transition: 'all 0.2s'
                }}>
                {loading ? 'Posting...' : step < 3 ? 'Continue →' : (
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

    {showQuickFund && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(20,18,58,0.85)',
    backdropFilter: 'blur(4px)', zIndex: 10000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
  }} onClick={() => !quickFunding && setShowQuickFund(false)}>
    <div onClick={e => e.stopPropagation()} style={{
      background: 'var(--color-surface)', borderRadius: '22px', padding: '24px',
      width: '100%', maxWidth: '420px'
    }}>
      <div style={{ fontSize: '17px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '4px' }}>
        Quick Top-Up
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        Fund your wallet to continue posting this gig. You'll come right back here.
      </div>
      <input
        type="number"
        value={quickFundAmount}
        onChange={e => setQuickFundAmount(e.target.value)}
        placeholder="Amount"
        style={{
          width: '100%', padding: '13px', borderRadius: '12px',
          border: '1.5px solid var(--color-border)', fontSize: '18px', fontWeight: '700',
          marginBottom: '12px', boxSizing: 'border-box', fontFamily: 'inherit'
        }}
      />
      {quickFundError && (
        <div style={{
          background: 'var(--color-danger-soft)', borderRadius: '10px', padding: '10px',
          marginBottom: '12px', color: 'var(--color-danger)', fontSize: '12px', fontWeight: '600'
        }}>{quickFundError}</div>
      )}
      <button
        onClick={async () => {
          const value = Number(quickFundAmount)
          if (!value || value <= 0) {
            setQuickFundError('Enter a valid amount')
            return
          }
          setQuickFunding(true)
          setQuickFundError('')
          try {
            const response = await startFincraWalletFunding(supabase, {
              amount: value,
              currency: form.currency,
              email: user.email,
              name: profile?.full_name || user.email,
              user_id: user.id,
            })
            if (!response?.checkoutUrl) throw new Error('Could not start funding.')

            // Save the in-progress gig so PostGig can resume on this
            // exact step after the user returns from Fincra checkout
            sessionStorage.setItem('prima_postgig_resume', JSON.stringify(form))
            window.location.href = response.checkoutUrl
          } catch (e) {
            setQuickFundError(e.message || 'Funding failed.')
            setQuickFunding(false)
          }
        }}
        disabled={quickFunding}
        style={{
          width: '100%', padding: '14px',
          background: quickFunding ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
          border: 'none', borderRadius: '12px', color: 'var(--color-surface)',
          fontSize: '14px', fontWeight: '700', cursor: quickFunding ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit'
        }}>
        {quickFunding ? 'Redirecting...' : 'Continue to Payment →'}
      </button>
    </div>
  </div>
)}
    </>
  )
}
