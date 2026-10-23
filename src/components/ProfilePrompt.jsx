import { getProfileCompletion } from '../utils/profileComplete'

export default function ProfilePrompt({ profile, onClose, onGoToProfile }) {
  const { score, requiredMissing, done, total } = getProfileCompletion(profile)

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
        background: 'var(--color-surface)', borderRadius: '24px',
        padding: '28px', width: '100%', maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        border: '1.5px solid var(--color-border)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>👤</div>
          <div style={{
            fontSize: '20px', fontWeight: '800',
            color: 'var(--color-text)', marginBottom: '8px'
          }}>Complete Your Profile First</div>
          <div style={{
            fontSize: '13px', color: 'var(--color-text-muted)',
            lineHeight: '1.6'
          }}>
            Add the basics people need to understand who you are and what work you do.
            A profile photo, location, phone number, and bio can be added later.
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '8px'
          }}>
            <span style={{
              fontSize: '12px', fontWeight: '700', color: 'var(--color-text)'
            }}>Profile Strength</span>
            <span style={{
              fontSize: '13px', fontWeight: '800',
              color: requiredMissing.length === 0 ? 'var(--color-success)' : 'var(--color-brand)'
            }}>{score}%</span>
          </div>
          <div style={{
            height: '8px', background: 'var(--color-page)',
            borderRadius: '4px', overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              width: `${score}%`,
              background: requiredMissing.length === 0
                ? 'linear-gradient(90deg, var(--color-success), #00E5A8)'
                : 'linear-gradient(90deg, var(--color-brand), var(--color-brand-mid))',
              transition: 'width 0.8s ease'
            }} />
          </div>
          <div style={{
            fontSize: '12px', color: 'var(--color-text-subtle)',
            marginTop: '5px'
          }}>{done} of {total} completed</div>
        </div>

        {/* Missing Items */}
        {requiredMissing.length > 0 && (
          <div style={{
            background: 'var(--color-page)', borderRadius: '14px',
            padding: '14px', marginBottom: '20px'
          }}>
            <div style={{
              fontSize: '12px', fontWeight: '700',
              color: 'var(--color-text-subtle)', textTransform: 'uppercase',
              letterSpacing: '0.8px', marginBottom: '10px'
            }}>Still needed</div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
              {requiredMissing.map((label, index) => (
                <div key={`${label}-${index}`} style={{
                  display: 'flex', gap: '8px', alignItems: 'center'
                }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    border: '2px solid var(--color-border)', background: 'var(--color-surface)',
                    flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{
                      width: '8px', height: '8px',
                      borderRadius: '50%', background: 'var(--color-border)'
                    }} />
                  </div>
                  <span style={{
                    fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: '500'
                  }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <button
          onClick={onGoToProfile}
          style={{
            width: '100%',
            background: 'var(--color-brand-gradient)',
            border: 'none', borderRadius: '12px', padding: '14px',
            fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
            marginBottom: '10px'
          }}>
          ✏️ Complete My Profile
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', background: 'transparent',
            border: 'none', padding: '10px',
            fontSize: '13px', fontWeight: '600',
            color: 'var(--color-text-subtle)', cursor: 'pointer',
            fontFamily: 'inherit'
          }}>Maybe later</button>

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
