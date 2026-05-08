import { getProfileCompletion } from '../utils/profileComplete'

export default function ProfilePrompt({ profile, onClose, onGoToProfile }) {
  const { score, missing, done, total } = getProfileCompletion(profile)

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
        padding: '28px', width: '100%', maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        border: '1.5px solid #E2E0FF',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>👤</div>
          <div style={{
            fontSize: '20px', fontWeight: '800',
            color: '#14123A', marginBottom: '8px'
          }}>Complete Your Profile First</div>
          <div style={{
            fontSize: '13px', color: '#8B8FAF',
            lineHeight: '1.6'
          }}>
            People need to know who they're working with.
            Complete your profile to post or apply for gigs.
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '8px'
          }}>
            <span style={{
              fontSize: '12px', fontWeight: '700', color: '#14123A'
            }}>Profile Strength</span>
            <span style={{
              fontSize: '13px', fontWeight: '800',
              color: score >= 80 ? '#00C48C' : '#6C47FF'
            }}>{score}%</span>
          </div>
          <div style={{
            height: '8px', background: '#F5F4FF',
            borderRadius: '4px', overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              width: `${score}%`,
              background: score >= 80
                ? 'linear-gradient(90deg, #00C48C, #00E5A8)'
                : 'linear-gradient(90deg, #6C47FF, #9B59FF)',
              transition: 'width 0.8s ease'
            }} />
          </div>
          <div style={{
            fontSize: '11px', color: '#A09DC8',
            marginTop: '5px'
          }}>{done} of {total} completed</div>
        </div>

        {/* Missing Items */}
        {missing.length > 0 && (
          <div style={{
            background: '#F5F4FF', borderRadius: '14px',
            padding: '14px', marginBottom: '20px'
          }}>
            <div style={{
              fontSize: '11px', fontWeight: '700',
              color: '#A09DC8', textTransform: 'uppercase',
              letterSpacing: '0.8px', marginBottom: '10px'
            }}>Still needed</div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
              {missing.map(item => (
                <div key={item.key} style={{
                  display: 'flex', gap: '8px', alignItems: 'center'
                }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    border: '2px solid #E2E0FF', background: '#fff',
                    flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{
                      width: '8px', height: '8px',
                      borderRadius: '50%', background: '#E2E0FF'
                    }} />
                  </div>
                  <span style={{
                    fontSize: '13px', color: '#5B5887', fontWeight: '500'
                  }}>{item.label}</span>
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
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '12px', padding: '14px',
            fontSize: '14px', fontWeight: '700', color: '#fff',
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
            color: '#A09DC8', cursor: 'pointer',
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