import BrandIcon from './BrandIcon'

export default function EmptyState({
  icon = 'discover',
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
  tone = 'default'
}) {
  const tones = {
    default: {
      bg: 'var(--color-surface)',
      iconBg: 'linear-gradient(135deg, var(--color-brand-soft) 0%, var(--color-brand-pale) 100%)',
      border: 'var(--color-border)',
      accent: 'var(--color-brand-border-strong)'
    },
    money: {
      bg: 'var(--color-surface)',
      iconBg: 'linear-gradient(135deg, var(--color-success-soft) 0%, var(--color-brand-soft) 100%)',
      border: 'var(--color-border)',
      accent: 'var(--color-success-border)'
    },
    warm: {
      bg: 'var(--color-surface)',
      iconBg: 'linear-gradient(135deg, var(--color-warning-soft) 0%, var(--color-brand-soft) 100%)',
      border: 'var(--color-border)',
      accent: 'var(--color-warning-border)'
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
        color: 'var(--color-text)',
        marginBottom: '7px'
      }}>
        {title}
      </div>

      {message && (
        <div style={{
          fontSize: '13px',
          color: 'var(--color-text-muted)',
          lineHeight: '1.6',
          maxWidth: '310px',
          margin: actionLabel ? '0 auto 18px' : '0 auto'
        }}>
          {message}
        </div>
      )}

      {actionLabel && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onAction}
            style={{
              background: 'var(--color-brand-gradient)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              fontSize: '13px',
              fontWeight: '800',
              color: 'var(--color-surface)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 5px 18px rgba(108,71,255,0.32)'
            }}
          >
            {actionLabel}
          </button>
          {secondaryLabel && (
            <button
              onClick={onSecondary}
              style={{
                background: 'transparent',
                border: '1.5px solid var(--color-border)',
                borderRadius: '12px',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: '600',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
