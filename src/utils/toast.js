let _styleInjected = false

function _injectStyle() {
  if (_styleInjected) return
  _styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes _primaToastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `
  document.head.appendChild(style)
}

export function showToast(msg, type = 'info') {
  _injectStyle()

  const bg = type === 'error'
    ? 'linear-gradient(135deg, #FF3366, #FF6B6B)'
    : type === 'success'
    ? 'linear-gradient(135deg, #00C48C, #00D4A0)'
    : 'linear-gradient(135deg, #6C47FF, #9B59FF)'

  const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ'

  const el = document.createElement('div')
  el.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'left:50%',
    'transform:translateX(-50%)',
    `background:${bg}`,
    'color:#fff',
    'padding:12px 18px',
    'border-radius:14px',
    'font-size:13px',
    'font-weight:600',
    'font-family:inherit',
    'box-shadow:0 8px 32px rgba(108,71,255,0.35)',
    'z-index:99999',
    'max-width:360px',
    'min-width:180px',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'animation:_primaToastIn 0.28s ease',
    'line-height:1.4',
    'pointer-events:none',
    'white-space:pre-wrap',
    'word-break:break-word',
  ].join(';')

  const iconEl = document.createElement('span')
  iconEl.style.cssText = 'font-size:15px;flex-shrink:0;opacity:0.9'
  iconEl.textContent = icon

  const textEl = document.createElement('span')
  textEl.textContent = msg

  el.appendChild(iconEl)
  el.appendChild(textEl)
  document.body.appendChild(el)

  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s'
    el.style.opacity = '0'
    el.style.transform = 'translateX(-50%) translateY(8px)'
    setTimeout(() => el.remove(), 320)
  }, 3500)
}
