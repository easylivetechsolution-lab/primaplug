import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const FIELDS = [
  'Development', 'Design', 'Writing', 'Marketing',
  'Photography', 'Events', 'Handyman', 'Cleaning', 'Electrical'
]

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
          top: '50%', transform: 'translateY(-50%)', fontSize: '14px'
        }}>
          {loading ? '⏳' : selected ? '✓' : '🔍'}
        </span>
      </div>
      {results.length > 0 && !selected && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fff', border: '1.5px solid #B8A5FF',
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
                  borderBottom: i < results.length - 1 ? '1px solid #F5F4FF' : 'none',
                  display: 'flex', gap: '8px', alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <span>📍</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#14123A' }}>
                    {name || r.display_name.split(',')[0]}
                  </div>
                  <div style={{ fontSize: '10px', color: '#A09DC8' }}>
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
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    username: '',
    phone: '',
    location: '',
    bio: '',
    work_experience: '',
    physical_mode: true,
    digital_mode: true,
    skills: [],
    portfolio_url: '',
    social_linkedin: '',
    social_twitter: '',
  })

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleSkill = (skill) => {
    setForm(f => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter(s => s !== skill)
        : [...f.skills, skill]
    }))
  }

  const handleSubmit = async () => {
    if (!form.full_name || !form.username) {
      setError('Please fill in your name and username')
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

      navigate('/dashboard')
    } catch (e) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
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

  const steps = ['Basic Info', 'Work & Experience', 'Skills & Links']

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '24px',
        padding: '36px',
        width: '100%',
        maxWidth: '480px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(108,71,255,0.3)'
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '52px', height: '52px',
            background: 'linear-gradient(135deg, #6C47FF, #FF4DCF)',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '24px',
            margin: '0 auto 10px'
          }}>🗺</div>
          <div style={{
            fontSize: '22px', fontWeight: '800',
            color: '#14123A', marginBottom: '4px'
          }}>Welcome to Prima!</div>
          <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
            Set up your profile to get started
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: s <= step ? '#6C47FF' : '#E2E0FF',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        {/* Step labels */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          {steps.map((label, i) => (
            <span key={label} style={{
              fontSize: '9px', fontWeight: '600',
              color: i + 1 <= step ? '#6C47FF' : '#A09DC8',
              letterSpacing: '0.5px'
            }}>{label}</span>
          ))}
        </div>

        <div style={{
          fontSize: '10px', color: '#6C47FF', fontWeight: '700',
          letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px'
        }}>Step {step} of 3</div>
        <div style={{
          fontSize: '18px', fontWeight: '800',
          color: '#14123A', marginBottom: '20px'
        }}>
          {step === 1 ? 'Who are you?' : step === 2 ? 'Work & Experience' : 'Skills & Links'}
        </div>

        {/* STEP 1 — Basic Info */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  color: '#A09DC8', fontSize: '14px'
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
                    icon: '📌',
                    title: 'Physical Work',
                    sub: 'On-location gigs near you',
                    color: '#FF6B2B',
                    bg: '#FFF0E8',
                    border: '#FFBC99'
                  },
                  {
                    key: 'digital_mode',
                    icon: '💻',
                    title: 'Digital Work',
                    sub: 'Remote gigs online',
                    color: '#6C47FF',
                    bg: '#EEE9FF',
                    border: '#B8A5FF'
                  }
                ].map(mode => (
                  <div key={mode.key}
                    onClick={() => update(mode.key, !form[mode.key])}
                    style={{
                      background: form[mode.key] ? mode.bg : '#F5F4FF',
                      border: `1.5px solid ${form[mode.key] ? mode.border : '#E2E0FF'}`,
                      borderRadius: '14px', padding: '14px 16px',
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', gap: '12px', alignItems: 'center'
                    }}>
                    <div style={{ fontSize: '24px' }}>{mode.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#14123A' }}>
                        {mode.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF', marginTop: '2px' }}>
                        {mode.sub}
                      </div>
                    </div>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: form[mode.key] ? mode.color : '#E2E0FF',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0
                    }}>
                      {form[mode.key] && (
                        <span style={{ color: '#fff', fontSize: '11px', fontWeight: '700' }}>✓</span>
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
              <label style={labelStyle}>Your Skills</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {FIELDS.map(field => (
                  <button key={field}
                    onClick={() => toggleSkill(field)}
                    style={{
                      background: form.skills.includes(field) ? '#EEE9FF' : '#F5F4FF',
                      border: `1.5px solid ${form.skills.includes(field) ? '#B8A5FF' : '#E2E0FF'}`,
                      borderRadius: '20px', padding: '8px 14px',
                      fontSize: '13px', fontWeight: '600',
                      color: form.skills.includes(field) ? '#6C47FF' : '#8B8FAF',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s'
                    }}>{field}</button>
                ))}
              </div>
            </div>

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
                background: '#FFE8EE',
                border: '1.5px solid #FF99B3',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: '#FF3366'
              }}>{error}</div>
            )}
          </div>
        )}

        {/* Buttons */}
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
              background: loading
                ? '#B8A5FF'
                : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', borderRadius: '12px',
              padding: '14px', fontSize: '14px',
              fontWeight: '700', color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
              fontFamily: 'inherit', transition: 'all 0.2s'
            }}>
            {loading ? '⏳ Saving...' : step < 3 ? 'Continue →' : '🚀 Enter Prima'}
          </button>
        </div>
      </div>
    </div>
  )
}