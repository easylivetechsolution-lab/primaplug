import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

const REPORT_REASONS = [
  { key: 'fake_profile', label: '🎭 Fake profile or impersonation' },
  { key: 'scam', label: '💸 Scam or fraud attempt' },
  { key: 'inappropriate', label: '🚫 Inappropriate content' },
  { key: 'harassment', label: '😡 Harassment or threats' },
  { key: 'suspicious_gig', label: '⚠️ Suspicious or fake gig' },
  { key: 'spam', label: '📢 Spam' },
  { key: 'other', label: '📝 Other' },
]

export default function ReportModal({
  onClose,
  reportedUserId,
  reportedGigId,
  reportedServiceId,
  type = 'user',
  name = 'this user'
}) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  const handleSubmit = async () => {
    if (!reason) { alert('Please select a reason'); return }
    if (!user) return
    setSubmitting(true)
    try {
      await supabase.from('reports').insert({
        reporter_id: user.id,
        reported_user_id: reportedUserId,
        reported_gig_id: reportedGigId || null,
        reported_service_id: reportedServiceId || null,
        type,
        reason,
        details: details.trim() || null,
        status: 'pending'
      })

      if (reportedUserId) {
        await supabase.from('notifications').insert({
          user_id: reportedUserId,
          title: '⚠️ Account Notice',
          message: 'Your account has received a report. Please ensure you follow Prima community guidelines.',
          type: 'general'
        })
      }

      const { data: admins } = await supabase
        .from('users').select('id').eq('is_admin', true)
      if (admins?.length > 0) {
        await supabase.from('notifications').insert(
          admins.map(admin => ({
            user_id: admin.id,
            title: '🚨 New Report Filed',
            message: `A ${type} has been reported. Reason: ${reason}`,
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
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '24px',
        width: '100%', maxWidth: '420px',
        maxHeight: '90vh', overflowY: 'auto',
        border: '1.5px solid #E2E0FF',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {submitted ? (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#DFFDF4', border: '3px solid #7EECD2',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '32px',
              margin: '0 auto 20px'
            }}>✓</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A', marginBottom: '8px' }}>
              Report Submitted
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', lineHeight: '1.6', marginBottom: '24px' }}>
              Thank you for keeping Prima safe. Our team will review this report within 24 hours.
              The reported person does not know who filed this report.
            </div>
            <button onClick={onClose} style={{
              width: '100%',
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: '14px', fontWeight: '700', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit'
            }}>Done</button>
          </div>
        ) : (
          <div style={{ padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#FF3366', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '3px' }}>Report</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#14123A' }}>Report {name}</div>
              </div>
              <button onClick={onClose} style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '10px', width: '36px', height: '36px',
                fontSize: '18px', color: '#8B8FAF', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
              }}>×</button>
            </div>

            <div style={{
              background: '#F5F4FF', borderRadius: '12px',
              padding: '12px 14px', marginBottom: '20px',
              display: 'flex', gap: '8px', alignItems: 'center'
            }}>
              <span style={{ fontSize: '16px' }}>🕵️</span>
              <span style={{ fontSize: '12px', color: '#6C47FF', fontWeight: '600' }}>
                Your report is completely anonymous
              </span>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#A09DC8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
                Select a reason
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {REPORT_REASONS.map(r => (
                  <div key={r.key} onClick={() => setReason(r.key)} style={{
                    background: reason === r.key ? '#EEE9FF' : '#F5F4FF',
                    border: `1.5px solid ${reason === r.key ? '#B8A5FF' : '#E2E0FF'}`,
                    borderRadius: '12px', padding: '12px 14px',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: reason === r.key ? '700' : '500', color: reason === r.key ? '#6C47FF' : '#14123A' }}>
                      {r.label}
                    </span>
                    {reason === r.key && <span style={{ color: '#6C47FF', fontSize: '16px' }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#A09DC8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
                Additional details (optional)
              </div>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Describe what happened..."
                style={{
                  width: '100%', background: '#F5F4FF',
                  border: '1.5px solid #E2E0FF', borderRadius: '12px',
                  padding: '12px 14px', fontSize: '13px',
                  color: '#14123A', fontFamily: 'inherit',
                  outline: 'none', resize: 'vertical',
                  minHeight: '80px', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                onBlur={e => e.target.style.borderColor = '#E2E0FF'}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              style={{
                width: '100%',
                background: !reason || submitting ? '#E2E0FF' : 'linear-gradient(135deg, #FF3366, #FF6B9B)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700',
                color: !reason || submitting ? '#A09DC8' : '#fff',
                cursor: !reason || submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: reason && !submitting ? '0 4px 20px rgba(255,51,102,0.35)' : 'none'
              }}>
              {submitting ? '⏳ Submitting...' : '🚨 Submit Report'}
            </button>
          </div>
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
