import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CURRENCIES } from '../data/currencies'
import { showToast } from '../utils/toast'

const inputStyle = {
  width: '100%',
  background: '#F5F4FF',
  border: '1.5px solid #E2E0FF',
  borderRadius: '10px',
  padding: '11px 14px',
  fontSize: '13px',
  color: '#14123A',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  fontSize: '10px',
  fontWeight: '700',
  color: '#8B8FAF',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  display: 'block',
  marginBottom: '6px',
}

const URGENCY_OPTIONS = [
  { key: 'now', label: '🔴 NOW', color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' },
  { key: 'today', label: '🟠 Today', color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99' },
  { key: 'scheduled', label: '🟣 Scheduled', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  { key: 'flexible', label: '⚪ Flexible', color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF' },
]

export default function EditGig({ gig, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: gig.title || '',
    description: gig.description || '',
    urgency: gig.urgency || 'flexible',
    currency: gig.currency || 'USD',
    pay_min: gig.pay_min || '',
    pay_max: gig.pay_max || '',
    slots: gig.slots || 1,
    duration_days: gig.duration_days || 1,
    house_number: gig.house_number || '',
    street: gig.street || '',
    landmark: gig.landmark || '',
    directions: gig.directions || '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])
  const [saved, setSaved] = useState(false)

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Please enter a title', 'error'); return }
    setSaving(true)
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + parseInt(form.duration_days || 1))

      const { error } = await supabase.from('gigs').update({
        title: form.title,
        description: form.description,
        urgency: form.urgency,
        currency: form.currency,
        pay_min: parseFloat(form.pay_min) || 0,
        pay_max: parseFloat(form.pay_max) || 0,
        slots: parseInt(form.slots) || 1,
        duration_days: parseInt(form.duration_days) || 1,
        expires_at: expiresAt.toISOString(),
        ...(gig.type === 'physical' && {
          house_number: form.house_number,
          street: form.street,
          landmark: form.landmark,
          directions: form.directions,
        }),
      }).eq('id', gig.id)

      if (error) throw error
      setSaved(true)
      setTimeout(() => {
        onSaved && onSaved()
        onClose()
      }, 1200)
    } catch (e) {
      showToast('Error saving: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const selectedCurr = CURRENCIES.find(c => c.code === form.currency) || CURRENCIES[0]

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff',
        borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '640px',
        maxHeight: '90vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '12px auto 0'
        }} />

        <div style={{ padding: '20px 24px 32px' }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '20px'
          }}>
            <div>
              <div style={{
                fontSize: '10px', color: '#6C47FF', fontWeight: '700',
                letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '3px'
              }}>Edit Gig</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A' }}>
                Update Details
              </div>
            </div>
            <button onClick={onClose} style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '10px', width: '36px', height: '36px',
              fontSize: '18px', color: '#8B8FAF', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit'
            }}>×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>Title</label>
              <input
                style={inputStyle}
                value={form.title}
                onChange={e => update('title', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                onBlur={e => e.target.style.borderColor = '#E2E0FF'}
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                value={form.description}
                onChange={e => update('description', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                onBlur={e => e.target.style.borderColor = '#E2E0FF'}
              />
            </div>

            {/* Urgency */}
            <div>
              <label style={labelStyle}>Urgency</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {URGENCY_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => update('urgency', opt.key)}
                    style={{
                      background: form.urgency === opt.key ? opt.bg : '#F5F4FF',
                      border: `1.5px solid ${form.urgency === opt.key ? opt.border : '#E2E0FF'}`,
                      borderRadius: '10px', padding: '8px 14px',
                      fontSize: '12px', fontWeight: '600',
                      color: form.urgency === opt.key ? opt.color : '#8B8FAF',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s'
                    }}>{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Currency + Pay */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Currency</label>
                <select
                  value={form.currency}
                  onChange={e => update('currency', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Min Pay ({selectedCurr.symbol})</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.pay_min}
                  onChange={e => update('pay_min', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>Max Pay ({selectedCurr.symbol})</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.pay_max}
                  onChange={e => update('pay_max', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
            </div>

            {/* Slots */}
            <div>
              <label style={labelStyle}>Slots Needed</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => update('slots', n)}
                    style={{
                      width: '44px', height: '44px',
                      background: form.slots === n ? '#6C47FF' : '#F5F4FF',
                      border: `1.5px solid ${form.slots === n ? '#6C47FF' : '#E2E0FF'}`,
                      borderRadius: '10px', fontSize: '14px',
                      fontWeight: '700',
                      color: form.slots === n ? '#fff' : '#8B8FAF',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s'
                    }}>{n}</button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label style={labelStyle}>Listing Duration</label>
              <select
                value={form.duration_days}
                onChange={e => update('duration_days', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                {[1, 2, 3, 5, 7, 14, 30].map(d => (
                  <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>

            {/* Physical address — only for physical gigs */}
            {gig.type === 'physical' && (
              <div style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '14px', padding: '16px'
              }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#6C47FF',
                  textTransform: 'uppercase', letterSpacing: '0.8px',
                  marginBottom: '12px'
                }}>📍 Address Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Building / House Number</label>
                    <input
                      style={{ ...inputStyle, background: '#fff' }}
                      placeholder="e.g. No. 12, Block B"
                      value={form.house_number}
                      onChange={e => update('house_number', e.target.value)}
                      onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                      onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Street</label>
                    <input
                      style={{ ...inputStyle, background: '#fff' }}
                      placeholder="e.g. Adeola Odeku Street"
                      value={form.street}
                      onChange={e => update('street', e.target.value)}
                      onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                      onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Landmark</label>
                    <input
                      style={{ ...inputStyle, background: '#fff' }}
                      placeholder="e.g. Behind GTBank"
                      value={form.landmark}
                      onChange={e => update('landmark', e.target.value)}
                      onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                      onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Additional Directions</label>
                    <textarea
                      style={{ ...inputStyle, background: '#fff', minHeight: '60px', resize: 'vertical' }}
                      placeholder="Any extra directions for the worker..."
                      value={form.directions}
                      onChange={e => update('directions', e.target.value)}
                      onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                      onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || saved}
              style={{
                width: '100%',
                background: saved
                  ? '#DFFDF4'
                  : saving
                    ? '#B8A5FF'
                    : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: saved ? '1.5px solid #7EECD2' : 'none',
                borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700',
                color: saved ? '#00C48C' : '#fff',
                cursor: (saving || saved) ? 'not-allowed' : 'pointer',
                boxShadow: (saving || saved) ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
                fontFamily: 'inherit', transition: 'all 0.2s'
              }}>
              {saved ? '✓ Saved!' : saving ? '⏳ Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}
