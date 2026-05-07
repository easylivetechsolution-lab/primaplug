import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import MapScreen from './screens/MapScreen'
import FeedScreen from './screens/FeedScreen'
import DiscoverScreen from './screens/DiscoverScreen'
import MyGigsScreen from './screens/MyGigsScreen'
import ProfileScreen from './screens/ProfileScreen'
import SavedScreen from './screens/SavedScreen'
import StatsScreen from './screens/StatsScreen'
import SettingsScreen from './screens/SettingsScreen'
import PostGig from './PostGig'
import NotificationBell from './NotificationBell'
import Search from './Search'
import ChatScreen from './screens/ChatScreen'
import FloatingChat from './FloatingChat'
import BrandIcon from './BrandIcon'

export default function Layout() {
  const { user } = useAuth()
  const [screen, setScreen] = useState('map')
  const [showPost, setShowPost] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showMobileMore, setShowMobileMore] = useState(false)
  const [fabPos, setFabPos] = useState({ bottom: 160, right: 16 })
  const fabDragRef = useRef({ on: false, moved: false, sx: 0, sy: 0, sb: 160, sr: 16 })

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    const unlock = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        const ctx = new AudioContext()
        ctx.resume()
      }
      document.removeEventListener('click', unlock)
    }
    document.addEventListener('click', unlock)
    return () => document.removeEventListener('click', unlock)
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!fabDragRef.current.on) return
      const t = e.touches?.[0] ?? e
      const dx = t.clientX - fabDragRef.current.sx
      const dy = t.clientY - fabDragRef.current.sy
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) fabDragRef.current.moved = true
      if (!fabDragRef.current.moved) return
      e.preventDefault()
      setFabPos({
        right: Math.max(8, Math.min(window.innerWidth - 64, fabDragRef.current.sr - dx)),
        bottom: Math.max(8, Math.min(window.innerHeight - 64, fabDragRef.current.sb + dy))
      })
    }
    const onEnd = () => { fabDragRef.current.on = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const navItems = [
    { key: 'map', icon: 'map', label: 'Map' },
    { key: 'feed', icon: 'feed', label: 'Feed' },
    { key: 'discover', icon: 'discover', label: 'Discover' },
    { key: 'mygigs', icon: 'mygigs', label: 'My Gigs' },
    { key: 'chat', icon: 'chat', label: 'Chat' },
    { key: 'profile', icon: 'profile', label: 'Profile' },
  ]

  const mobileMoreItems = [
    { key: 'search', icon: 'search', label: 'Search', action: () => setShowSearch(true) },
    { key: 'saved', icon: 'saved', label: 'Saved Gigs', action: () => setScreen('saved') },
    { key: 'stats', icon: 'stats', label: 'My Stats', action: () => setScreen('stats') },
    { key: 'chat', icon: 'chat', label: 'Messages', action: () => setScreen('chat') },
    { key: 'settings', icon: 'settings', label: 'Settings', action: () => setScreen('settings') },
  ]

  const screens = {
    map: <MapScreen />,
    feed: <FeedScreen />,
    discover: <DiscoverScreen />,
    mygigs: <MyGigsScreen />,
    profile: <ProfileScreen onLogout={handleLogout} />,
    saved: <SavedScreen />,
    stats: <StatsScreen />,
    settings: <SettingsScreen onLogout={handleLogout} />,
    chat: <ChatScreen />,
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      minHeight: '100dvh',
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      background: '#F5F4FF',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>

      {/* TOP BAR */}
      <div style={{
        height: '64px',
        background: '#fff',
        borderBottom: '1.5px solid #E2E0FF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        zIndex: 100
      }} className="app-topbar">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px'
          }}>
            <BrandIcon name="map" size={36} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A', letterSpacing: '-0.5px' }}>Prima</div>
            <div className="brand-subtitle" style={{ fontSize: '9px', color: '#A09DC8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Real-Time Labor Network</div>
          </div>
        </div>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', gap: '4px' }} className="desktop-nav">
          {navItems.map(item => (
            <button key={item.key} onClick={() => { setScreen(item.key); setShowMobileMore(false) }}
              style={{
                background: screen === item.key ? '#EEE9FF' : 'transparent',
                border: `1.5px solid ${screen === item.key ? '#B8A5FF' : 'transparent'}`,
                borderRadius: '10px',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: screen === item.key ? '700' : '500',
                color: screen === item.key ? '#6C47FF' : '#8B8FAF',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
                fontFamily: 'inherit'
              }}>
              <BrandIcon name={item.icon} size={28} active={screen === item.key} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <NotificationBell onNavigate={(screen) => setScreen(screen)} />
          <button
            onClick={() => setShowSearch(true)}
            className="desktop-action"
            style={{
              background: '#F5F4FF',
              border: '1.5px solid #E2E0FF',
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#8B8FAF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontFamily: 'inherit',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#B8A5FF'
              e.currentTarget.style.color = '#6C47FF'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#E2E0FF'
              e.currentTarget.style.color = '#8B8FAF'
            }}>
            <BrandIcon name="search" size={30} />
            <span className="search-label">Search</span>
            <span style={{
              background: '#E2E0FF', borderRadius: '5px',
              padding: '1px 6px', fontSize: '10px',
              color: '#A09DC8', fontWeight: '700'
            }}>⌘K</span>
          </button>
          <button
            onClick={() => setShowMobileMore(m => !m)}
            className="mobile-more-trigger"
            style={{
              background: showMobileMore ? '#EEE9FF' : '#F5F4FF',
              border: `1.5px solid ${showMobileMore ? '#B8A5FF' : '#E2E0FF'}`,
              borderRadius: '12px',
              width: '44px',
              height: '44px',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
            aria-label="More dashboard actions"
          >
            <BrandIcon name="settings" size={30} active={showMobileMore} />
          </button>
        </div>
      </div>

      {showMobileMore && (
        <div
          className="mobile-more-menu"
          style={{
            display: 'none',
            position: 'fixed',
            top: '58px',
            right: '12px',
            width: '220px',
            background: '#fff',
            border: '1.5px solid #E2E0FF',
            borderRadius: '16px',
            boxShadow: '0 16px 44px rgba(108,71,255,0.18)',
            zIndex: 300,
            overflow: 'hidden'
          }}
        >
          {mobileMoreItems.map(item => (
            <button
              key={item.key}
              onClick={() => {
                item.action()
                setShowMobileMore(false)
              }}
              style={{
                width: '100%',
                background: screen === item.key ? '#F8F7FF' : '#fff',
                border: 'none',
                borderBottom: '1px solid #F5F4FF',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              <BrandIcon name={item.icon} size={34} active={screen === item.key || item.key === 'search'} />
              <span style={{
                fontSize: '13px',
                fontWeight: '700',
                color: screen === item.key ? '#6C47FF' : '#14123A'
              }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }} className="app-body">

        {/* SIDEBAR - desktop only */}
        <div style={{
          width: '72px',
          background: '#fff',
          borderRight: '1.5px solid #E2E0FF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: '4px',
          flexShrink: 0
        }} className="desktop-sidebar">

          {/* Search */}
          <button
            onClick={() => setShowSearch(true)}
            title="Search Gigs"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: 'transparent',
              border: '1.5px solid transparent',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EEE9FF'
              e.currentTarget.style.borderColor = '#B8A5FF'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
            }}>
            <BrandIcon name="search" size={32} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: '#A09DC8' }}>Search</span>
          </button>

          {/* Saved Gigs */}
          <button
            onClick={() => setScreen('saved')}
            title="Saved Gigs"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'saved' ? '#EEE9FF' : 'transparent',
              border: `1.5px solid ${screen === 'saved' ? '#B8A5FF' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EEE9FF'
              e.currentTarget.style.borderColor = '#B8A5FF'
            }}
            onMouseLeave={e => {
              if (screen !== 'saved') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="saved" size={32} active={screen === 'saved'} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: screen === 'saved' ? '#6C47FF' : '#A09DC8' }}>Saved</span>
          </button>

          {/* My Stats */}
          <button
            onClick={() => setScreen('stats')}
            title="My Stats"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'stats' ? '#EEE9FF' : 'transparent',
              border: `1.5px solid ${screen === 'stats' ? '#B8A5FF' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EEE9FF'
              e.currentTarget.style.borderColor = '#B8A5FF'
            }}
            onMouseLeave={e => {
              if (screen !== 'stats') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="stats" size={32} active={screen === 'stats'} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: screen === 'stats' ? '#6C47FF' : '#A09DC8' }}>Stats</span>
          </button>

          {/* Chat */}
          <button
            onClick={() => setScreen('chat')}
            title="Messages"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'chat' ? '#EEE9FF' : 'transparent',
              border: `1.5px solid ${screen === 'chat' ? '#B8A5FF' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit',
              position: 'relative'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EEE9FF'
              e.currentTarget.style.borderColor = '#B8A5FF'
            }}
            onMouseLeave={e => {
              if (screen !== 'chat') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="chat" size={32} active={screen === 'chat'} />
            <span style={{
              fontSize: '9px', fontWeight: '600',
              color: screen === 'chat' ? '#6C47FF' : '#A09DC8'
            }}>Chat</span>
          </button>

          {/* Divider */}
          <div style={{
            width: '32px', height: '1px',
            background: '#E2E0FF', margin: '6px 0'
          }} />

          {/* Settings */}
          <button
            onClick={() => setScreen('settings')}
            title="Settings"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'settings' ? '#EEE9FF' : 'transparent',
              border: `1.5px solid ${screen === 'settings' ? '#B8A5FF' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EEE9FF'
              e.currentTarget.style.borderColor = '#B8A5FF'
            }}
            onMouseLeave={e => {
              if (screen !== 'settings') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="settings" size={32} active={screen === 'settings'} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: screen === 'settings' ? '#6C47FF' : '#A09DC8' }}>Settings</span>
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Post Gig — Primary CTA */}
          <button
            onClick={() => setShowPost(true)}
            title="Post a Gig"
            style={{
              width: '48px', height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', color: '#fff',
              fontSize: '24px', fontWeight: '300',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer', marginBottom: '4px',
              boxShadow: '0 4px 16px rgba(108,71,255,0.4)',
              transition: 'all 0.2s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(108,71,255,0.5)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,71,255,0.4)'
            }}>
              <BrandIcon name="post" size={34} />
            </button>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: screen === 'map' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch'
          }} className="screen-scroll">
            {screens[screen]}
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div style={{
        display: 'none',
        background: '#fff',
        borderTop: '1.5px solid #E2E0FF',
        padding: '10px 8px 20px',
        justifyContent: 'space-around',
        alignItems: 'center',
        flexShrink: 0,
        zIndex: 50
      }} className="mobile-nav">
        {navItems.map(item => (
          <button key={item.key} onClick={() => { setScreen(item.key); setShowMobileMore(false) }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}>
            <BrandIcon name={item.icon} size={30} active={screen === item.key} />
            <span style={{
              fontSize: '9px',
              fontWeight: screen === item.key ? '700' : '500',
              color: screen === item.key ? '#6C47FF' : '#A09DC8'
            }}>{item.label}</span>
            {screen === item.key && (
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#6C47FF' }} />
            )}
          </button>
        ))}
      </div>

      {/* MOBILE FAB */}
      <button
        onMouseDown={(e) => {
          fabDragRef.current = { on: true, moved: false, sx: e.clientX, sy: e.clientY, sb: fabPos.bottom, sr: fabPos.right }
        }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          fabDragRef.current = { on: true, moved: false, sx: t.clientX, sy: t.clientY, sb: fabPos.bottom, sr: fabPos.right }
        }}
        onClick={() => {
          if (fabDragRef.current.moved) { fabDragRef.current.moved = false; return }
          setShowPost(true)
        }}
        style={{
          position: 'fixed',
          bottom: fabPos.bottom,
          right: fabPos.right,
          zIndex: 60,
          width: '54px', height: '54px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
          border: 'none',
          color: '#fff',
          fontSize: '26px',
          cursor: 'grab',
          boxShadow: '0 4px 20px rgba(108,71,255,0.5)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit',
          touchAction: 'none',
          userSelect: 'none'
        }} className="mobile-fab">
          <BrandIcon name="post" size={36} />
        </button>

      {/* POST GIG MODAL */}
      {showPost && <PostGig onClose={() => setShowPost(false)} />}

      {/* SEARCH */}
      {showSearch && (
        <Search onClose={() => setShowSearch(false)} />
      )}

      <style>{`
        @media (max-width: 768px) {
          .app-topbar {
            height: 58px !important;
            padding: 0 12px !important;
          }
          .app-topbar > div:first-child {
            min-width: 0;
          }
          .app-topbar > div:first-child > div:last-child > div:first-child {
            font-size: 17px !important;
          }
          .brand-subtitle { display: none !important; }
          .desktop-nav { display: none !important; }
          .desktop-sidebar { display: none !important; }
          .desktop-action { display: none !important; }
          .mobile-more-trigger { display: flex !important; }
          .mobile-more-menu { display: block !important; }
          .mobile-nav { display: flex !important; }
          .mobile-fab { display: flex !important; }
          .search-label { display: none !important; }
          .app-body {
            min-height: 0 !important;
          }
          .screen-scroll {
            padding-bottom: 96px !important;
          }
          .mobile-nav {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            padding: 8px 6px calc(10px + env(safe-area-inset-bottom)) !important;
            box-shadow: 0 -8px 28px rgba(20,18,58,0.08);
          }
          .mobile-nav button {
            min-width: 0 !important;
            flex: 1 1 0 !important;
            padding: 5px 2px !important;
          }
          .floating-chat-shell {
            display: none !important;
          }
        }
        @media (max-width: 960px) {
          .desktop-nav { display: none !important; }
        }
      `}</style>

      {/* Floating Chat — visible on all screens */}
      <div className="floating-chat-shell">
        <FloatingChat onOpenFullChat={() => setScreen('chat')} />
      </div>
    </div>
  )
}
