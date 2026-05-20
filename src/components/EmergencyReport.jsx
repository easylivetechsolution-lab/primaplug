import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function EmergencyReport({ onClose, gigId, reportedUserId }) {
  const { user, profile } = useAuth()
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  useEffect(() => { getLocation() }, [])

  const getLocation = () => {
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGettingLocation(false)
      },
      () => setGettingLocation(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const handleSubmit = async () => {
    if (!description.trim()) { alert('Please describe what happened'); return }
    setSubmitting(true)
    try {
      await supabase.from('emergency_reports').insert({
        reporter_id: user.id,
        reported_user_id: reportedUserId || null,
        gig_id: gigId || null,
        description: description.trim(),
        location_lat: location?.lat || null,
        location_lng: location?.lng || null,
        status: 'pending'
      })

      const { data: admins } = await supabase
        .from('users').select('id').eq('is_admin', true)
      if (admins?.length > 0) {
        await supabase.from('notifications').insert(
          admins.map(admin => ({
            user_id: admin.id,
            title: '🆘 EMERGENCY REPORT',
            message: `URGENT: ${profile?.full_name} has filed an emergency report. Immediate attention required.`,
            type: 'general'
          }))
        )
      }
      setSubmitted(true)
    } catch (e) {
      alert('Error submitting report: ' + e.message)
    }
    setSubmitting(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.85)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '24px',
        width: '100%', maxWidth: '420px',
        border: '2px solid #FF99B3',
        boxShadow: '0 20px 60px rgba(255,51,102,0.3)',
        overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {submitted ? (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#FFE8EE', border: '3px solid #FF99B3',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '32px',
              margin: '0 auto 20px'
            }}>🆘</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A', marginBottom: '8px' }}>
              Report Received
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', lineHeight: '1.7', marginBottom: '20px' }}>
              Our team has been notified immediately. We will review your report and take action.
              If this is a life-threatening emergency, please call your local emergency services
              (Nigeria: 112 or 199).
            </div>
            <button onClick={onClose} style={{
              width: '100%',
              background: 'linear-gradient(135deg, #FF3366, #FF6B9B)',
              border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: '14px', fontWeight: '700', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit'
            }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{
              background: 'linear-gradient(135deg, #FF3366, #FF6B9B)',
              padding: '24px 28px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Emergency</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#fff' }}>🆘 Report Incident</div>
              </div>
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none',
                borderRadius: '10px', width: '36px', height: '36px',
                fontSize: '18px', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
              }}>×</button>
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div style={{
                background: location ? '#DFFDF4' : '#FFF8E0',
                border: `1px solid ${location ? '#7EECD2' : '#FFD966'}`,
                borderRadius: '10px', padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex', gap: '8px', alignItems: 'center',
                fontSize: '12px', fontWeight: '600',
                color: location ? '#00C48C' : '#FFB800'
              }}>
                <span>{location ? '📍' : '⏳'}</span>
                <span>
                  {gettingLocation ? 'Getting your location...' : location
                    ? 'Your location has been captured'
                    : 'Location unavailable — report will still be sent'}
                </span>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#A09DC8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
                  What happened?
                </div>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the incident in detail — who was involved, what happened, when and where..."
                  style={{
                    width: '100%', background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF', borderRadius: '12px',
                    padding: '12px 14px', fontSize: '13px',
                    color: '#14123A', fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical',
                    minHeight: '120px', boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = '#FF99B3'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  autoFocus
                />
              </div>

              <div style={{
                background: '#FFE8EE', borderRadius: '10px',
                padding: '12px 14px', marginBottom: '20px',
                fontSize: '12px', color: '#FF3366', lineHeight: '1.5'
              }}>
                ⚠️ False emergency reports are a serious violation of Prima's terms and may result in permanent account suspension.
              </div>

              <button
                onClick={handleSubmit}
                disabled={!description.trim() || submitting}
                style={{
                  width: '100%',
                  background: !description.trim() || submitting ? '#E2E0FF' : 'linear-gradient(135deg, #FF3366, #FF6B9B)',
                  border: 'none', borderRadius: '12px', padding: '16px',
                  fontSize: '14px', fontWeight: '700',
                  color: !description.trim() || submitting ? '#A09DC8' : '#fff',
                  cursor: !description.trim() || submitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: description.trim() && !submitting ? '0 4px 20px rgba(255,51,102,0.4)' : 'none'
                }}>
                {submitting ? '⏳ Sending...' : '🆘 Send Emergency Report'}
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
  )
}
