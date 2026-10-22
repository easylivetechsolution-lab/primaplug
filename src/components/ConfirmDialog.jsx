export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      background: 'linear-gradient(135deg, rgba(89,53,232,0.58), rgba(30,27,75,0.68))',
      backdropFilter: 'blur(7px)',
    }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '420px', padding: '24px', borderRadius: '22px',
        background: 'var(--color-brand-surface-gradient)',
        boxShadow: '0 20px 60px rgba(30,27,75,0.28), var(--shadow-glass)',
      }}>
        <div style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '1.2px', color: 'var(--color-danger)', textTransform: 'uppercase', marginBottom: '6px' }}>Please confirm</div>
        <h2 id="confirm-dialog-title" style={{ color: 'var(--color-text)', fontSize: '20px', marginBottom: '8px' }}>{title}</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: 1.55 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
          <button type="button" onClick={onCancel} style={{
            minHeight: '44px', padding: '0 18px', borderRadius: '12px',
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text-muted)', font: 'inherit', fontWeight: '700', cursor: 'pointer',
          }}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{
            minHeight: '44px', padding: '0 20px', borderRadius: '12px', border: 'none',
            background: 'var(--color-danger)', color: 'white', font: 'inherit', fontWeight: '700', cursor: 'pointer',
            boxShadow: '0 5px 16px rgba(197,29,71,0.2)',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
