export default function VerificationBadge({ compact = false, onDark = false, size = 'default' }) {
  const iconSize = compact ? 18 : size === 'small' ? 18 : 20

  return (
    <span
      title="Verified"
      aria-label="Verified"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 0 : '6px',
        borderRadius: compact ? '50%' : '999px',
        padding: compact ? '0' : size === 'small' ? '3px 8px 3px 3px' : '4px 10px 4px 4px',
        background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 55%, #FFFFFF 190%)',
        border: '1px solid rgba(255,255,255,0.72)',
        boxShadow: onDark
          ? '0 6px 18px rgba(20,18,58,0.18), inset 0 1px 0 rgba(255,255,255,0.42)'
          : '0 5px 16px rgba(108,71,255,0.26), inset 0 1px 0 rgba(255,255,255,0.5)',
        color: '#fff',
        fontSize: size === 'small' ? '9px' : '10px',
        fontWeight: '800',
        letterSpacing: '0.7px',
        lineHeight: 1,
        textTransform: 'uppercase',
        flexShrink: 0
      }}
    >
      <span style={{
        width: iconSize,
        height: iconSize,
        borderRadius: '50%',
        background: '#fff',
        color: '#6C47FF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px rgba(108,71,255,0.12)'
      }}>
        <svg
          width={Math.round(iconSize * 0.68)}
          height={Math.round(iconSize * 0.68)}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 10.4 8.2 14l7.3-8" />
        </svg>
      </span>
      {!compact && <span>Verified</span>}
    </span>
  )
}
