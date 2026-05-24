import BrandIcon from './BrandIcon'

export default function EmptyState({
  icon = 'discover',
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
  tone = 'default'
}) {
  const tones = {
    default: {
      bg: '#fff',
      iconBg: 'linear-gradient(135deg, #EEE9FF 0%, #F8F5FF 100%)',
      border: '#E2E0FF',
      accent: '#B8A5FF'
    },
    money: {
      bg: '#fff',
      iconBg: 'linear-gradient(135deg, #DFFDF4 0%, #EEE9FF 100%)',
      border: '#E2E0FF',
      accent: '#7EECD2'
    },
    warm: {
      bg: '#fff',
      iconBg: 'linear-gradient(135deg, #FFF0E8 0%, #EEE9FF 100%)',
      border: '#E2E0FF',
      accent: '#FFBC99'
    }
  }
  const colors = tones[tone] || tones.default

  return (
    <div style={{
      textAlign: 'center',
      padding: compact ? '32px 18px' : '48px 20px',
      background: colors.bg,
      borderRadius: compact ? '16px' : '20px',
      border: `1.5px solid ${colors.border}`,
      boxShadow: compact ? 'none' : '0 10px 28px rgba(108,71,255,0.06)'
    }}>
      <div style={{
        width: compact ? '64px' : '78px',
        height: compact ? '64px' : '78px',
        borderRadius: compact ? '20px' : '24px',
        margin: compact ? '0 auto 14px' : '0 auto 16px',
        background: colors.iconBg,
        border: `1.5px solid ${colors.accent}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 12px 28px rgba(108,71,255,0.12)'
      }}>
        <BrandIcon name={icon} size={compact ? 44 : 54} />
      </div>

      <div style={{
        fontSize: compact ? '15px' : '16px',
        fontWeight: '800',
        color: '#14123A',
        marginBottom: '7px'
      }}>
        {title}
      </div>

      {message && (
        <div style={{
          fontSize: '13px',
          color: '#8B8FAF',
          lineHeight: '1.6',
          maxWidth: '310px',
          margin: actionLabel ? '0 auto 18px' : '0 auto'
        }}>
          {message}
        </div>
      )}

      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 20px',
            fontSize: '13px',
            fontWeight: '800',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 5px 18px rgba(108,71,255,0.32)'
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
