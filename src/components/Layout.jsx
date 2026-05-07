import { useState, useEffect } from 'react'
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

export default function Layout() {
  const { user } = useAuth()
  const [screen, setScreen] = useState('map')
  const [showPost, setShowPost] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [isLive, setIsLive] = useState(false)

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const navItems = [
    { key: 'map', icon: '🗺', label: 'Map' },
    { key: 'feed', icon: '⚡', label: 'Feed' },
    { key: 'discover', icon: '✦', label: 'Discover' },
    { key: 'mygigs', icon: '📋', label: 'My Gigs' },
    { key: 'profile', icon: '👤', label: 'Profile' },
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
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
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
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #6C47FF, #FF4DCF)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px'
          }}>🗺</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A', letterSpacing: '-0.5px' }}>Prima</div>
            <div style={{ fontSize: '9px', color: '#A09DC8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Real-Time Labor Network</div>
          </div>
        </div>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', gap: '4px' }} className="desktop-nav">
          {navItems.map(item => (
            <button key={item.key} onClick={() => setScreen(item.key)}
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
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <NotificationBell onNavigate={(screen) => setScreen(screen)} />
          <button onClick={() => setIsLive(l => !l)}
            style={{
              background: isLive ? '#DFFDF4' : 'transparent',
              border: `1.5px solid ${isLive ? '#00C48C' : '#E2E0FF'}`,
              borderRadius: '20px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: '700',
              color: isLive ? '#00C48C' : '#8B8FAF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'inherit',
              transition: 'all 0.2s'
            }}>
            <span style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: isLive ? '#00C48C' : '#A09DC8',
              display: 'inline-block',
              animation: isLive ? 'blink 1s infinite' : 'none'
            }}/>
            {isLive ? 'LIVE' : 'Go Live'}
          </button>

          <button onClick={() => setShowPost(true)}
            style={{
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none',
              borderRadius: '12px',
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              boxShadow: '0 4px 16px rgba(108,71,255,0.35)',
              fontFamily: 'inherit',
              transition: 'all 0.2s'
            }}>
            <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
            Post a Gig
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

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
              width: '48px', height: '48px',
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
            <span style={{ fontSize: '20px' }}>🔍</span>
            <span style={{ fontSize: '9px', fontWeight: '600', color: '#A09DC8' }}>Search</span>
          </button>

          {/* Saved Gigs */}
          <button
            onClick={() => setScreen('saved')}
            title="Saved Gigs"
            style={{
              width: '48px', height: '48px',
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
            <span style={{ fontSize: '20px' }}>🔖</span>
            <span style={{ fontSize: '9px', fontWeight: '600', color: screen === 'saved' ? '#6C47FF' : '#A09DC8' }}>Saved</span>
          </button>

          {/* My Stats */}
          <button
            onClick={() => setScreen('stats')}
            title="My Stats"
            style={{
              width: '48px', height: '48px',
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
            <span style={{ fontSize: '20px' }}>📊</span>
            <span style={{ fontSize: '9px', fontWeight: '600', color: screen === 'stats' ? '#6C47FF' : '#A09DC8' }}>Stats</span>
          </button>

          {/* Messages — coming soon */}
          <button
            title="Messages — Coming Soon"
            style={{
              width: '48px', height: '48px',
              borderRadius: '12px', background: 'transparent',
              border: '1.5px solid transparent',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'not-allowed',
              opacity: 0.5, fontFamily: 'inherit'
            }}>
            <span style={{ fontSize: '20px' }}>💬</span>
            <span style={{ fontSize: '9px', fontWeight: '600', color: '#A09DC8' }}>Chat</span>
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
              width: '48px', height: '48px',
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
            <span style={{ fontSize: '20px' }}>⚙️</span>
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
            }}>+</button>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            flex: 1,
            overflowY: screen === 'map' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch'
          }}>
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
          <button key={item.key} onClick={() => setScreen(item.key)}
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
            <span style={{
              fontSize: '20px',
              filter: screen === item.key ? 'none' : 'grayscale(1) opacity(0.4)'
            }}>{item.icon}</span>
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
      <button onClick={() => setShowPost(true)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '16px',
          zIndex: 60,
          width: '54px', height: '54px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
          border: 'none',
          color: '#fff',
          fontSize: '26px',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(108,71,255,0.5)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit'
        }} className="mobile-fab">+</button>

      {/* POST GIG MODAL */}
      {showPost && <PostGig onClose={() => setShowPost(false)} />}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .desktop-sidebar { display: none !important; }
          .mobile-nav { display: flex !important; }
          .mobile-fab { display: flex !important; }
        }
        @media (max-width: 960px) {
          .desktop-nav { display: none !important; }
        }
      `}</style>
    </div>
  )
}