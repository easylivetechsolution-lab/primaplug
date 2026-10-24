import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import CategoryPicker from '../components/CategoryPicker'
import BrandIcon from '../components/BrandIcon'
import { processReferral, generateReferralCode, completeReferral } from '../utils/referral'
import { isReferralProfileComplete } from '../utils/profileComplete'

const LocationSearch = ({ value, onSelect, inputStyle }) => {
  const [search, setSearch] = useState(value || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(!!value)

  const handleSearch = async (val) => {
    setSearch(val)
    setSelected(false)
    onSelect('')
    if (val.length < 3) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      setResults(data)
    } catch (e) { console.log(e) }
    setLoading(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inputStyle, paddingRight: '36px' }}
          placeholder="Search your city or area..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <span style={{
          position: 'absolute', right: '12px',
          top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center'
        }}>
          {loading
            ? <span className="onboarding-location-spinner" aria-label="Searching locations" />
            : <BrandIcon name={selected ? 'accepted' : 'search'} size={22} active={false} />}
        </span>
      </div>
      {results.length > 0 && !selected && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--color-surface)', border: '1.5px solid var(--color-brand-border-strong)',
          borderRadius: '12px', marginTop: '4px',
          zIndex: 100, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(108,71,255,0.15)'
        }}>
          {results.map((r, i) => {
            const city = r.address?.city || r.address?.town || r.address?.village || ''
            const country = r.address?.country || ''
            const state = r.address?.state || ''
            const name = [city, state, country].filter(Boolean).join(', ')
            return (
              <div key={i}
                onClick={() => {
                  setSearch(name)
                  setResults([])
                  setSelected(true)
                  onSelect(name)
                }}
                style={{
                  padding: '11px 14px', cursor: 'pointer',
                  borderBottom: i < results.length - 1 ? '1px solid var(--color-page)' : 'none',
                  display: 'flex', gap: '8px', alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
              >
                <BrandIcon name="location" size={24} active={false} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
                    {name || r.display_name.split(',')[0]}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    {r.display_name.substring(0, 50)}...
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Onboarding() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: user?.user_metadata?.full_name || '',
    username: '',
    phone: '',
    location: '',
    bio: '',
    work_experience: '',
    physical_mode: true,
    digital_mode: true,
    skills: [],
    custom_skill: '',
    portfolio_url: '',
    social_linkedin: '',
    social_twitter: '',
  })

  useEffect(() => {
    if (!user?.id) return
    let active = true
    supabase.from('users')
      .select('full_name, username, phone, location, bio, work_experience, physical_mode, digital_mode, skills, portfolio_url, social_linkedin, social_twitter')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (!active || fetchError || !data) return
        setForm(current => ({
          ...current,
          ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null)),
          full_name: data.full_name || current.full_name || '',
          skills: current.skills.length ? current.skills : (data.skills || [])
        }))
      })
    return () => { active = false }
  }, [user?.id])

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.username.trim() || form.skills.length === 0) {
      setError('Please add your full name, username, and at least one skill')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      const payload = {
        full_name: form.full_name,
        username: form.username.toLowerCase().replace(/\s/g, ''),
        email: user.email,
        phone: form.phone,
        location: form.location,
        bio: form.bio,
        work_experience: form.work_experience,
        physical_mode: form.physical_mode,
        digital_mode: form.digital_mode,
        skills: form.skills,
        portfolio_url: form.portfolio_url,
        social_linkedin: form.social_linkedin,
        social_twitter: form.social_twitter,
        joined_at: new Date().toISOString(),
      }

      let result
      if (existing) {
        result = await supabase
          .from('users')
          .update(payload)
          .eq('id', user.id)
      } else {
        result = await supabase
          .from('users')
          .insert({ ...payload, id: user.id })
      }

      if (result.error) {
        setError(result.error.message)
        setLoading(false)
        return
      }

      // Generate referral code for new user
      await generateReferralCode(user.id, form.username, form.full_name)

      // Process any pending referral
      await processReferral()

      if (isReferralProfileComplete(payload)) {
        await completeReferral()
      }

      // Sync AuthContext so Layout gets the fresh profile immediately
      refreshProfile()

      navigate('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--color-page)',
    border: '1.5px solid var(--color-border)',
    borderRadius: '9px',
    padding: '10px 12px',
    fontSize: '14px',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    display: 'block',
    marginBottom: '5px'
  }

  const steps = ['Basic Info', 'Work & Experience', 'Skills & Links']

  return (
    <div className="onboarding-shell" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div className="onboarding-card" style={{
        background: 'var(--color-surface)',
        borderRadius: '20px',
        padding: '28px',
        width: '100%',
        maxWidth: '440px',
        maxHeight: '86vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(108,71,255,0.3)'
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src="/prima-logo.png" alt="" aria-hidden="true" style={{
            width: '46px', height: '46px', objectFit: 'contain',
            borderRadius: '12px', display: 'block', margin: '0 auto 9px'
          }} />
          <div style={{
            fontSize: '22px', fontWeight: '800',
            color: 'var(--color-text)', marginBottom: '4px'
          }}>Welcome to Prima!</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Set up your profile to get started
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: s <= step ? 'var(--color-brand)' : 'var(--color-border)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        {/* Step labels */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginBottom: '18px'
        }}>
          {steps.map((label, i) => (
            <span key={label} style={{
              fontSize: '12px', fontWeight: '600',
              color: i + 1 <= step ? 'var(--color-brand)' : 'var(--color-text-subtle)',
              letterSpacing: '0.5px'
            }}>{label}</span>
          ))}
        </div>

        <div style={{
          fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700',
          letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px'
        }}>Step {step} of 3</div>
        <div style={{
          fontSize: '17px', fontWeight: '800',
          color: 'var(--color-text)', marginBottom: '16px'
        }}>
          {step === 1 ? 'Who are you?' : step === 2 ? 'Work & Experience' : 'Skills & Links'}
        </div>

        {/* STEP 1 — Basic Info */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input
                style={inputStyle}
                placeholder="e.g. Peter Johnson"
                value={form.full_name}
                onChange={e => update('full_name', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Username *</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px',
                  top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--color-text-subtle)', fontSize: '14px'
                }}>@</span>
                <input
                  style={{ ...inputStyle, paddingLeft: '28px' }}
                  placeholder="yourname"
                  value={form.username}
                  onChange={e => update('username', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                style={inputStyle}
                placeholder="e.g. +234 800 000 0000"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
              />
            </div>
            <div>
  <label style={labelStyle}>Your Location</label>
  <LocationSearch
    value={form.location}
    onSelect={(name) => update('location', name)}
    inputStyle={inputStyle}
  />
</div>
            <div>
              <label style={labelStyle}>Bio</label>
              <textarea
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                placeholder="Tell people what you do and what makes you great..."
                value={form.bio}
                onChange={e => update('bio', e.target.value)}
              />
            </div>
          </div>
        )}

        {/* STEP 2 — Work & Experience */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Work Experience</label>
              <textarea
                style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                placeholder="Describe your work experience, past projects, achievements..."
                value={form.work_experience}
                onChange={e => update('work_experience', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Work Modes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  {
                    key: 'physical_mode',
                    icon: 'physical',
                    title: 'Physical Work',
                    sub: 'On-location gigs near you',
                    color: 'var(--color-warning)',
                    bg: 'var(--color-warning-soft)',
                    border: 'var(--color-warning-border)'
                  },
                  {
                    key: 'digital_mode',
                    icon: 'digital',
                    title: 'Digital Work',
                    sub: 'Remote gigs online',
                    color: 'var(--color-brand)',
                    bg: 'var(--color-brand-soft)',
                    border: 'var(--color-brand-border-strong)'
                  }
                ].map(mode => (
                  <div key={mode.key}
                    onClick={() => update(mode.key, !form[mode.key])}
                    style={{
                      background: form[mode.key] ? mode.bg : 'var(--color-page)',
                      border: `1.5px solid ${form[mode.key] ? mode.border : 'var(--color-border)'}`,
                      borderRadius: '14px', padding: '14px 16px',
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', gap: '12px', alignItems: 'center'
                    }}>
                    <BrandIcon name={mode.icon} size={34} active={form[mode.key]} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text)' }}>
                        {mode.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {mode.sub}
                      </div>
                    </div>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: form[mode.key] ? mode.color : 'var(--color-border)',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0
                    }}>
                      {form[mode.key] && (
                        <span style={{ color: 'var(--color-surface)', fontSize: '12px', fontWeight: '700' }}>✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — Skills & Links */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Your Primary Field</label>
              <CategoryPicker
                selected={form.skills[0] || ''}
                onSelect={(field) => update('skills', field ? [field, ...form.skills.slice(1)] : form.skills.slice(1))}
                customSkill={form.custom_skill || ''}
                onCustomSkill={(val) => update('custom_skill', val)}
              />
            </div>

            {form.skills.length > 0 && (
              <div>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  Additional Skills (tap to add more)
                </label>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {form.skills.map((skill, i) => (
                    <span key={i} style={{
                      background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '20px', padding: '6px 12px',
                      fontSize: '12px', fontWeight: '600', color: 'var(--color-brand)',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      {skill}
                      <span
                        onClick={() => update('skills', form.skills.filter((_, j) => j !== i))}
                        style={{ cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-subtle)' }}>×</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Portfolio URL (optional)</label>
              <input
                style={inputStyle}
                placeholder="e.g. https://myportfolio.com"
                value={form.portfolio_url}
                onChange={e => update('portfolio_url', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>LinkedIn (optional)</label>
              <input
                style={inputStyle}
                placeholder="e.g. linkedin.com/in/yourname"
                value={form.social_linkedin}
                onChange={e => update('social_linkedin', e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Twitter / X (optional)</label>
              <input
                style={inputStyle}
                placeholder="e.g. twitter.com/yourname"
                value={form.social_twitter}
                onChange={e => update('social_twitter', e.target.value)}
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--color-danger-soft)',
                border: '1.5px solid var(--color-danger-border)',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: 'var(--color-danger)'
              }}>{error}</div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} style={{
              flex: 1, background: 'var(--color-page)',
              border: '1.5px solid var(--color-border)',
              borderRadius: '12px', padding: '14px',
              fontSize: '13px', fontWeight: '600',
              color: 'var(--color-text-muted)', cursor: 'pointer',
              fontFamily: 'inherit'
            }}>← Back</button>
          )}
          <button
            onClick={step < 3 ? () => setStep(s => s + 1) : handleSubmit}
            disabled={loading}
            style={{
              flex: 2,
              background: loading
                ? 'var(--color-brand-border-strong)'
                : 'var(--color-brand-gradient)',
              border: 'none', borderRadius: '12px',
              padding: '14px', fontSize: '14px',
              fontWeight: '700', color: 'var(--color-surface)',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
              fontFamily: 'inherit', transition: 'all 0.2s'
            }}>
            {loading ? 'Saving…' : step < 3 ? 'Continue →' : 'Complete profile & enter Prima'}
          </button>
        </div>
      </div>
    </div>
  )
}
