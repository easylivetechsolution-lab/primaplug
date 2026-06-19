const ICON_PATHS = {
  search: (
    <>
      <circle cx="14.2" cy="14.2" r="5.3" />
      <path d="M18.2 18.2 23 23" />
    </>
  ),
  edit: (
    <>
      <path d="M10 21.8h4.1L23 12.9 19.1 9 10.2 17.9 10 21.8Z" />
      <path d="M17.9 10.2 21.8 14.1" />
    </>
  ),
  post: (
    <>
      <path d="M16 9.2v13.6" />
      <path d="M9.2 16h13.6" />
    </>
  ),
  camera: (
    <>
      <path d="M9 11.8h4l1.3-2h3.4l1.3 2h4v10.3H9V11.8Z" />
      <circle cx="16" cy="17.1" r="3.2" />
    </>
  ),
  physical: (
    <>
      <path d="M16 23.6s5.7-4.6 5.7-9.6a5.7 5.7 0 0 0-11.4 0c0 5 5.7 9.6 5.7 9.6Z" />
      <path d="M16 11.5v4.8" />
      <path d="M13.6 13.9h4.8" />
    </>
  ),
  digital: (
    <>
      <path d="M8.8 10h14.4v9.4H8.8V10Z" />
      <path d="M13.2 23h5.6" />
      <path d="M16 19.4V23" />
    </>
  ),
  title: (
    <>
      <path d="M9.5 10.4h13" />
      <path d="M9.5 16h10" />
      <path d="M9.5 21.6h7.2" />
    </>
  ),
  pay: (
    <>
      <circle cx="16" cy="16" r="8.2" />
      <path d="M18.4 12.8c-.7-.5-1.5-.8-2.4-.8-1.4 0-2.4.7-2.4 1.8s.8 1.6 2.6 2.1c1.8.5 2.7 1.1 2.7 2.3s-1.1 2-2.7 2c-1 0-2.1-.3-3-.9" />
      <path d="M16 10.5v11" />
    </>
  ),
  slots: (
    <>
      <circle cx="12.2" cy="13" r="2.7" />
      <circle cx="19.8" cy="13" r="2.7" />
      <path d="M8.5 23c.7-3 2.1-4.4 4.3-4.4" />
      <path d="M23.5 23c-.7-3-2.1-4.4-4.3-4.4" />
      <path d="M12.1 22.6c.7-2.4 1.9-3.6 3.9-3.6s3.2 1.2 3.9 3.6" />
    </>
  ),
  lock: (
    <>
      <path d="M10.4 14.2h11.2v9.1H10.4v-9.1Z" />
      <path d="M13.1 14.2v-2.1a2.9 2.9 0 0 1 5.8 0v2.1" />
      <path d="M16 18.1v2.2" />
    </>
  ),
  portfolio: (
    <>
      <path d="M9.4 12h13.2v10.4H9.4V12Z" />
      <path d="M13 12v-1.4h6V12" />
      <path d="M9.4 16.3h13.2" />
    </>
  ),
  linkedin: (
    <>
      <path d="M10.5 14.1v8.1" />
      <path d="M10.5 10.2v.1" />
      <path d="M15.1 22.2v-4.7c0-2.3 1.3-3.7 3.3-3.7 1.9 0 3.1 1.3 3.1 3.8v4.6" />
    </>
  ),
  twitter: (
    <>
      <path d="M10 9.8 22 22.2" />
      <path d="M22 9.8 10 22.2" />
      <path d="M11 9.8h3.3L21 22.2h-3.3L11 9.8Z" />
    </>
  ),
  tech: (
    <>
      <path d="M9.1 10.4h13.8v9.2H9.1v-9.2Z" />
      <path d="M13.2 23h5.6" />
      <path d="M13.2 15 11.6 16.6l1.6 1.6" />
      <path d="M18.8 15l1.6 1.6-1.6 1.6" />
    </>
  ),
  creative: (
    <>
      <path d="M16 7.8c4.1 0 7.4 2.9 7.4 6.6 0 2.7-1.7 4.1-3.6 4.1h-1.2c-.8 0-1.2.5-1.2 1.2 0 1.3-1 2.5-2.8 2.5-3.3 0-6-2.9-6-6.9 0-4.2 3.3-7.5 7.4-7.5Z" />
      <circle cx="12.4" cy="14.2" r=".4" />
      <circle cx="15" cy="11.9" r=".4" />
      <circle cx="18.2" cy="12.6" r=".4" />
    </>
  ),
  business: (
    <>
      <path d="M9.2 12h13.6v10.3H9.2V12Z" />
      <path d="M13.2 12V9.8h5.6V12" />
      <path d="M9.2 16.2h13.6" />
    </>
  ),
  education: (
    <>
      <path d="M8.5 11.5 16 8.4l7.5 3.1-7.5 3.1-7.5-3.1Z" />
      <path d="M11 13.2v4.2c1.5 1.2 3.2 1.8 5 1.8s3.5-.6 5-1.8v-4.2" />
      <path d="M23.5 11.5v5" />
    </>
  ),
  trades: (
    <>
      <path d="M20.8 9.1 22.9 11.2 13 21.1 10.9 19 20.8 9.1Z" />
      <path d="M9.2 22.8 12 20" />
      <path d="M17.8 12.1 19.9 14.2" />
    </>
  ),
  home: (
    <>
      <path d="M8.8 15.1 16 9l7.2 6.1" />
      <path d="M11 14v8.2h10V14" />
      <path d="M14.3 22.2v-4.7h3.4v4.7" />
    </>
  ),
  health: (
    <>
      <path d="M16 23s-7-4.2-7-9.1c0-2.3 1.7-4 3.8-4 1.4 0 2.5.7 3.2 1.8.7-1.1 1.8-1.8 3.2-1.8 2.1 0 3.8 1.7 3.8 4 0 4.9-7 9.1-7 9.1Z" />
      <path d="M16 13.2v4.2" />
      <path d="M13.9 15.3h4.2" />
    </>
  ),
  events: (
    <>
      <path d="M10.2 22.3 16 8.4l5.8 13.9" />
      <path d="M12.7 16.3h6.6" />
      <path d="M9.2 22.3h13.6" />
    </>
  ),
  logistics: (
    <>
      <path d="M8.7 13.3h9.6v6.8H8.7v-6.8Z" />
      <path d="M18.3 15.2h3.1l1.9 2.4v2.5h-5" />
      <circle cx="12" cy="21.1" r="1.5" />
      <circle cx="20.2" cy="21.1" r="1.5" />
    </>
  ),
  saved: (
    <path d="M11 9.2c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v14.1l-5-3.1-5 3.1V9.2Z" />
  ),
  unsaved: (
    <>
      <path d="M11 9.2c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v14.1l-5-3.1-5 3.1V9.2Z" />
      <path d="M9.2 8.2 22.8 23.1" />
    </>
  ),
  send: (
    <>
      <path d="M8.2 8.9 24.1 16 8.2 23.1l2.3-7.1-2.3-7.1Z" />
      <path d="M10.7 16h7.8" />
    </>
  ),
  compose: (
    <>
      <path d="M9.2 10.2h10.2c1.3 0 2.4 1.1 2.4 2.4v4.7c0 1.3-1.1 2.4-2.4 2.4h-5.2l-4.3 3.1v-3.1h-.7c-1.3 0-2.4-1.1-2.4-2.4v-4.7c0-1.3 1.1-2.4 2.4-2.4Z" />
      <path d="M14.7 15.1 21.5 8.3" />
      <path d="M19.4 8.5 21.7 10.8" />
    </>
  ),
  suggest: (
    <>
      <path d="M16 7.5 17.8 13.4 23.7 16 17.8 18.6 16 24.5 14.2 18.6 8.3 16 14.2 13.4 16 7.5Z" />
      <path d="M22.6 7.8v3" />
      <path d="M21.1 9.3h3" />
    </>
  ),
  commission: (
    <>
      <path d="M8.6 12.2h14.8v9.6H8.6v-9.6Z" />
      <path d="M11.4 14.4c1 0 1.8-.8 1.8-1.8" />
      <path d="M20.6 14.4c-1 0-1.8-.8-1.8-1.8" />
      <path d="M11.4 19.6c1 0 1.8.8 1.8 1.8" />
      <path d="M20.6 19.6c-1 0-1.8.8-1.8 1.8" />
      <circle cx="16" cy="17" r="2.2" />
      <path d="M11.8 9.2h8.4" />
    </>
  ),
  stats: (
    <>
      <path d="M9.4 21.8v-5.2" />
      <path d="M15 21.8V10.2" />
      <path d="M20.6 21.8v-8.1" />
      <path d="M8.2 22.4h13.6" />
    </>
  ),
  open: (
    <>
      <circle cx="16" cy="16" r="7" />
      <path d="M16 11.5v4.8l3.4 2" />
    </>
  ),
  completed: (
    <>
      <circle cx="16" cy="16" r="8" />
      <path d="M12.2 16.2 15 19l5.1-6" />
    </>
  ),
  applied: (
    <>
      <path d="M10 8.7h8.5l3.5 3.7v10.9H10V8.7Z" />
      <path d="M18.2 8.9v4h3.7" />
      <path d="M13.1 18.1h5.8" />
    </>
  ),
  accepted: (
    <>
      <path d="M16 7.5 18.6 13l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.3-4.2 6-.9L16 7.5Z" />
      <path d="M13.4 16.4 15.2 18l3.5-4" />
    </>
  ),
  rating: (
    <path d="M16 7.3 18.7 13l6.2.9-4.5 4.4 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2-4.5-4.4 6.2-.9L16 7.3Z" />
  ),
  level: (
    <>
      <path d="M16 7.4 22.2 11v7.2L16 24.6l-6.2-6.4V11L16 7.4Z" />
      <path d="M13 16.1 15.2 18.3 19.2 13.7" />
    </>
  ),
  chat: (
    <path d="M8.2 14.7c0-4 3.5-7.1 8.1-7.1s8.1 3.1 8.1 7.1-3.5 7.1-8.1 7.1c-.8 0-1.5-.1-2.2-.3l-4.2 2.2 1-3.7c-1.7-1.3-2.7-3.2-2.7-5.3Z" />
  ),
  notifications: (
    <>
      <path d="M11.1 19.9h9.8" />
      <path d="M12.1 18.2v-4.5a3.9 3.9 0 0 1 7.8 0v4.5l1.6 1.7h-11l1.6-1.7Z" />
      <path d="M14.7 22.1c.4.7 1.1 1.1 2.3 1.1s1.9-.4 2.3-1.1" />
    </>
  ),
  receipt: (
    <>
      <path d="M10 7.8h12v16.4l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V7.8Z" />
      <path d="M13 12.4h6" />
      <path d="M13 16h6" />
      <path d="M13 19.6h3.4" />
    </>
  ),
  reviews: (
    <>
      <path d="M9.3 10.1h13.4v9.6H16l-4.3 3.3v-3.3H9.3V10.1Z" />
      <path d="M13 15h6" />
    </>
  ),
  sound: (
    <>
      <path d="M9.2 18.5h3.2l4.1 3.5V10l-4.1 3.5H9.2v5Z" />
      <path d="M19.3 13.2c.8.8 1.2 1.7 1.2 2.8s-.4 2-1.2 2.8" />
      <path d="M22 10.7c1.5 1.5 2.2 3.2 2.2 5.3s-.7 3.8-2.2 5.3" />
    </>
  ),
  map: (
    <>
      <path d="M16 23.7s6.1-4.7 6.1-10a6.1 6.1 0 0 0-12.2 0c0 5.3 6.1 10 6.1 10Z" />
      <circle cx="16" cy="13.6" r="2" />
    </>
  ),
  location: (
    <>
      <path d="M16 23.7s5.4-4.1 5.4-8.9a5.4 5.4 0 0 0-10.8 0c0 4.8 5.4 8.9 5.4 8.9Z" />
      <circle cx="16" cy="14.8" r="1.7" />
    </>
  ),
  phone: (
    <path d="M11.6 8.4h8.8c.8 0 1.4.6 1.4 1.4v12.4c0 .8-.6 1.4-1.4 1.4h-8.8c-.8 0-1.4-.6-1.4-1.4V9.8c0-.8.6-1.4 1.4-1.4Z" />
  ),
  feed: (
    <>
      <path d="M9.8 10.1h12.4" />
      <path d="M9.8 15.8h12.4" />
      <path d="M9.8 21.5h7.2" />
      <circle cx="7.1" cy="10.1" r=".6" />
      <circle cx="7.1" cy="15.8" r=".6" />
      <circle cx="7.1" cy="21.5" r=".6" />
    </>
  ),
  discover: (
    <>
      <path d="M16 6.9 18 14l7.1 2-7.1 2-2 7.1-2-7.1-7.1-2 7.1-2 2-7.1Z" />
      <path d="M22.8 7.1v3.4" />
      <path d="M21.1 8.8h3.4" />
    </>
  ),
  mygigs: (
    <>
      <path d="M10.6 9.4h10.8c.9 0 1.6.7 1.6 1.6v10.6c0 .9-.7 1.6-1.6 1.6H10.6c-.9 0-1.6-.7-1.6-1.6V11c0-.9.7-1.6 1.6-1.6Z" />
      <path d="M13 7.3h6" />
      <path d="M13 14h6" />
      <path d="M13 18.4h4.3" />
    </>
  ),
  profile: (
    <>
      <circle cx="16" cy="12.3" r="4.1" />
      <path d="M8.7 24.1c1.2-3.7 3.6-5.5 7.3-5.5s6.1 1.8 7.3 5.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="16" cy="16" r="3" />
      <path d="M16 7.6v2.1M16 22.3v2.1M22 10l-1.5 1.5M11.5 20.5 10 22M24.4 16h-2.1M9.7 16H7.6M22 22l-1.5-1.5M11.5 11.5 10 10" />
    </>
  ),
  services: (
    <>
      <path d="M10 12.2h12v10.1H10V12.2Z" />
      <path d="M13.1 12.2v-1.8h5.8v1.8" />
      <path d="M10 16.1h12" />
      <path d="M14.1 18.7h3.8" />
    </>
  ),
}

const TILE_GRADIENT = 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 52%, #FF4DCF 100%)'

export default function BrandIcon({ name, size = 30, active = true, title, tone }) {
  const icon = ICON_PATHS[name] || ICON_PATHS.discover
  const activeBackground = tone || TILE_GRADIENT

  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.22)),
        background: active ? activeBackground : '#EEF0F8',
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,0.42), 0 5px 14px rgba(108,71,255,0.28)'
          : 'inset 0 1px 0 rgba(255,255,255,0.75)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <span style={{
        position: 'absolute',
        inset: '1px 1px auto',
        height: '42%',
        borderRadius: 'inherit',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0))',
        pointerEvents: 'none'
      }} />
      <svg
        width={Math.round(size * 0.7)}
        height={Math.round(size * 0.7)}
        viewBox="0 0 32 32"
        fill="none"
        stroke={active ? '#fff' : '#8B8FAF'}
        strokeWidth="2.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: 'relative', zIndex: 1 }}
      >
        {icon}
      </svg>
    </span>
  )
}
