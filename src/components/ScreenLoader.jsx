export default function ScreenLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{ position: 'relative', width: '72px', height: '72px' }}>
        <div style={{
          position: 'absolute', inset: 0,
          border: '3px solid #E2E0FF',
          borderTop: '3px solid #6C47FF',
          borderRadius: '50%',
          animation: 'primaspin 0.8s linear infinite',
          boxSizing: 'border-box',
        }} />
        <img src="/prima-logo.png" alt="" style={{
          position: 'absolute',
          top: '9px', left: '9px',
          width: '54px', height: '54px',
          borderRadius: '14px',
          objectFit: 'contain',
        }} />
      </div>
      <style>{`@keyframes primaspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
