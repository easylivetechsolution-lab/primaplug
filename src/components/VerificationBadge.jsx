import { useId } from 'react'

export default function VerificationBadge({ compact = false, size = 'default' }) {
  const gradientId = `prima-verified-${useId().replace(/:/g, '')}`
  const iconSize = compact ? 20 : size === 'small' ? 20 : 24

  return (
    <span title="Verified" role="img" aria-label="Verified" style={{
      display: 'inline-flex',
      width: iconSize,
      height: iconSize,
      flex: '0 0 auto',
      verticalAlign: 'middle'
    }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6C47FF" />
            <stop offset="0.52" stopColor="#9B59FF" />
            <stop offset="1" stopColor="#FF4DCF" />
          </linearGradient>
        </defs>
        <path
          d="M12 1.2 14.5 2.8 17.4 2.5 18.7 5.1 21.3 6.4 21 9.3 22.6 12 21 14.5 21.3 17.4 18.7 18.7 17.4 21.3 14.5 21 12 22.6 9.3 21 6.4 21.3 5.1 18.7 2.5 17.4 2.8 14.5 1.2 12 2.8 9.3 2.5 6.4 5.1 5.1 6.4 2.5 9.3 2.8 12 1.2Z"
          fill={`url(#${gradientId})`}
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="m7.2 12.2 3.1 3.1 6.6-6.7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
