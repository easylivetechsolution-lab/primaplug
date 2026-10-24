import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAdmin } from '../hooks/useAdmin'
import { supabase } from '../supabase'
import { getProfileCompletion } from '../utils/profileComplete'
import ProfilePrompt from './ProfilePrompt'
import MapScreen from './screens/MapScreen'
import FeedScreen from './screens/FeedScreen'
import DiscoverScreen from './screens/DiscoverScreen'
import MyGigsScreen from './screens/MyGigsScreen'
import { getCapturedGigReferral, clearGigReferral } from '../utils/referral'
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
import ReferralScreen from './screens/ReferralScreen'
import CommissionScreen from './screens/CommissionScreen'
import WithdrawalScreen from './screens/WithdrawalScreen'
import WalletScreen from './screens/WalletScreen'
import NotificationsScreen from './screens/NotificationsScreen'
import { initPushNotifications } from '../utils/pushNotifications'
import { useCredits } from '../context/CreditsContext'
import { useLanguage } from '../context/LanguageContext'

// ── App Download Banner ──────────────────────────────────────────────────────
const ANDROID_APK_URL = 'https://pub-bcdbcd3dbd3148c28060148c0929cc03.r2.dev/app/PrimaPlug-latest.apk'
const normalizeDashboardScreen = (screen) => screen === 'services' ? 'map' : screen
const IOS_APP_URL     = null // ← paste App Store link here when ready

function AppDownloadBanner() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem('prima_app_banner_dismissed') } catch (_) { return true }
  })
  const [showIOSHint, setShowIOSHint] = useState(false)

  if (!visible) return null

  const ua = navigator.userAgent || ''
  const isIOS     = /iphone|ipad|ipod/i.test(ua)
  const isAndroid = /android/i.test(ua)

  const dismiss = () => {
    try { localStorage.setItem('prima_app_banner_dismissed', '1') } catch (_) {}
    setVisible(false)
  }

  // On desktop show both; on mobile show only the relevant one
  const showAndroid = !isIOS
  const showIOS     = !isAndroid

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--color-text) 0%, var(--color-brand-deep) 100%)',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: '10px',
      flexShrink: 0, zIndex: 9400, position: 'relative'
    }}>
      <span style={{ fontSize: '22px', flexShrink: 0 }}>📱</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-surface)', marginBottom: '2px' }}>
          Get the PrimaPlug App
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Faster experience — real-time notifications & live tracking
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
        {showAndroid && (
          <a
            href={ANDROID_APK_URL}
            download
            style={{
              background: 'var(--color-brand)', color: 'var(--color-surface)',
              padding: '6px 12px', borderRadius: '8px',
              fontSize: '13px', fontWeight: '700',
              textDecoration: 'none', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}>
            🤖 Android
          </a>
        )}
        {showIOS && (
          <button
            onClick={() => setShowIOSHint(h => !h)}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: 'var(--color-surface)',
              padding: '6px 12px', borderRadius: '8px',
              fontSize: '13px', fontWeight: '700',
              whiteSpace: 'nowrap', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              position: 'relative', fontFamily: 'inherit'
            }}>
            🍎 Add to iPhone
            {showIOSHint && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                  background: 'var(--color-surface)', borderRadius: '12px',
                  border: '1.5px solid var(--color-border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  padding: '12px 14px', minWidth: '220px',
                  textAlign: 'left', color: 'var(--color-text)', zIndex: 9999,
                  fontWeight: '400'
                }}>
                <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: 'var(--color-text)' }}>
                  Add PrimaPlug to iPhone
                </div>
                {[
                  '1. Open this page in Safari',
                  '2. Tap the Share button (⬜↑)',
                  '3. Scroll down → "Add to Home Screen"',
                  '4. Tap "Add" to confirm',
                ].map((step, i) => (
                  <div key={i} style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '5px', lineHeight: '1.4' }}>
                    {step}
                  </div>
                ))}
                <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '8px', borderTop: '1px solid var(--color-page)', paddingTop: '6px' }}>
                  Must use Safari — Chrome on iOS won't work
                </div>
              </div>
            )}
          </button>
        )}
      </div>
      <button 
        onClick={dismiss}
        style={{
          background: 'none', border: 'none', color: 'var(--color-text-muted)',
          fontSize: '18px', cursor: 'pointer', padding: '0 2px',
          lineHeight: 1, flexShrink: 0
        }}>×</button>
    </div>
  )
}

export default function Layout() {
  const { user, profile, loading } = useAuth()
  const { isAdmin } = useAdmin()
  const { hasUnpaidCommissions } = useCredits()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [screen, setScreen] = useState(() => {
    const requestedScreen = new URLSearchParams(window.location.search).get('screen')
    return normalizeDashboardScreen(window.history.state?.screen || requestedScreen || 'map')
  })
  const [showPost, setShowPost] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showMobileMore, setShowMobileMore] = useState(false)
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const appRef = useRef(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let viewportBaseHeight = Math.max(window.innerHeight, vv.height)
    const update = () => {
      if (!appRef.current) return
      const keyboardOpen = screen === 'chat' && viewportBaseHeight - vv.height > 120
      if (!keyboardOpen) viewportBaseHeight = Math.max(window.innerHeight, vv.height)
      appRef.current.style.height = vv.height + 'px'
      appRef.current.style.top = vv.offsetTop + 'px'
      document.body.classList.toggle('chat-keyboard-open', keyboardOpen)
    }
    const resetViewportBase = () => {
      viewportBaseHeight = Math.max(window.innerHeight, vv.height)
      update()
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('orientationchange', resetViewportBase)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('orientationchange', resetViewportBase)
      document.body.classList.remove('chat-keyboard-open')
    }
  }, [screen])

  const navigateTo = useCallback((newScreen) => {
    newScreen = normalizeDashboardScreen(newScreen)
    if (!newScreen || newScreen === screen) return
    setScreen(newScreen)
    window.history.pushState({ screen: newScreen }, '', '')
    requestAnimationFrame(() => {
      document.querySelector('.screen-scroll')?.scrollTo({ top: 0, behavior: 'instant' })
    })
  }, [screen])

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

  // Navigate when a push notification is tapped from the OS
  useEffect(() => {
    if (!navigator.serviceWorker) return
    const handler = (event) => {
      if (event.data?.type !== 'PUSH_NAVIGATE') return
      navigateTo(event.data.screen || 'feed')
      if (event.data.gigId && ['feed'].includes(event.data.screen || 'feed')) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('openGigDetail', {
              detail: event.data.gigId
            }))
          })
        })
      }
      if (event.data.conversationId) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('openChat', {
              detail: { convoId: event.data.conversationId }
            }))
          })
        })
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [navigateTo])

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
    const handleNavigate = (e) => {
      const { screen: targetScreen } = e.detail || {}
      if (targetScreen) {
        navigateTo(targetScreen)
        setShowMobileMore(false)
      }
    }
    window.addEventListener('navigateToScreen', handleNavigate)
    return () => window.removeEventListener('navigateToScreen', handleNavigate)
  }, [navigateTo])

  useEffect(() => {
    const handleNavigate = (e) => navigateTo(e.detail)
    window.addEventListener('navigateTo', handleNavigate)
    return () => window.removeEventListener('navigateTo', handleNavigate)
  }, [navigateTo])

  useEffect(() => {
    const handleOpenPost = () => setShowPost(true)
    window.addEventListener('openPostGig', handleOpenPost)
    return () => window.removeEventListener('openPostGig', handleOpenPost)
  }, [])

  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => {
      if (Notification.permission === 'default') {
        setShowPushPrompt(true)
      }
    }, 30000)
    return () => clearTimeout(timer)
  }, [user])

  useEffect(() => {
    if (loading || !user) return
    const { requiredMissing } = getProfileCompletion(profile)
    if (requiredMissing.length > 0) {
      const timer = setTimeout(() => setShowProfilePrompt(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [profile, loading, user])

  // Broadcast presence as soon as the user is on the dashboard — not just when chat is open
  useEffect(() => {
    if (!user?.id) return
    const presenceCh = supabase.channel('prima-presence')
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceCh.track({ user_id: user.id })
        }
      })
    return () => { supabase.removeChannel(presenceCh) }
  }, [user?.id])

  // Mark the current dashboard history entry without adding an extra Back step.
  useEffect(() => {
    const currentScreen = normalizeDashboardScreen(window.history.state?.screen || screen)
    window.history.replaceState(
      { ...(window.history.state || {}), screen: currentScreen },
      '',
      `${window.location.pathname}${window.location.search}`
    )
  }, [])

  // Restore the specific destination when a push opens a fresh app window.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gigId = params.get('gigId')
    const conversationId = params.get('conversationId')
    if (!gigId && !conversationId) return

    params.delete('gigId')
    params.delete('conversationId')
    params.delete('screen')
    const query = params.toString()
    window.history.replaceState(
      { ...(window.history.state || {}), screen },
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`
    )

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gigId && screen === 'feed') {
          window.dispatchEvent(new CustomEvent('openGigDetail', { detail: gigId }))
        }
        if (conversationId && screen === 'chat') {
          window.dispatchEvent(new CustomEvent('openChat', { detail: { convoId: conversationId } }))
        }
      })
    })
  }, [])

const walletReturnHandled = useRef(false)

useEffect(() => {
  if (walletReturnHandled.current) return

  const params = new URLSearchParams(window.location.search)
  const reference = params.get('reference')

  if (reference && reference.startsWith('wallet_')) {
    walletReturnHandled.current = true
    window.history.replaceState({}, '', window.location.pathname)

    const checkPurposeAndNavigate = async () => {
      const { data: txRow } = await supabase
        .from('wallet_transactions')
        .select('description')
        .eq('fincra_reference', reference)
        .maybeSingle()

      const isCommission = txRow?.description?.includes('Commission payment')
      const targetScreen = isCommission ? 'commission' : 'wallet'

      navigateTo(targetScreen)
      window.dispatchEvent(new CustomEvent('walletPaymentReturn', { detail: { reference, isCommission } }))
    }

    checkPurposeAndNavigate()
  }
}, [navigateTo])

const [pendingGigReferral, setPendingGigReferral] = useState(null)

useEffect(() => {
  if (!user) return
  const captured = getCapturedGigReferral()
  if (captured?.gigId) {
    setPendingGigReferral(captured)
  }
}, [user])

  // Restore dashboard screens from the browser's own history state.
  useEffect(() => {
    const handlePopState = (event) => {
      const previousScreen = event.state?.screen
      if (previousScreen) {
        setScreen(normalizeDashboardScreen(previousScreen))
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const navItems = [
    { key: 'map', icon: 'home', label: t('home') },
    { key: 'feed', icon: 'feed', label: t('feed') },
    { key: 'discover', icon: 'discover', label: t('discover') },
    { key: 'mygigs', icon: 'mygigs', label: t('myGigs') },
    { key: 'chat', icon: 'chat', label: t('chat') },
    { key: 'profile', icon: 'profile', label: t('profile') },
  ]

  const mobileMoreItems = [
    { key: 'discover', icon: 'discover', label: 'Discover', action: () => navigateTo('discover') },
    { key: 'referral', icon: 'refer', label: 'Refer & Earn', action: () => navigateTo('referral') },
    { key: 'wallet', icon: 'wallet', label: 'Wallet', action: () => navigateTo('wallet') },
    { key: 'commission', icon: 'owed', label: 'Commission', action: () => navigateTo('commission') },
    { key: 'withdrawal', icon: 'withdraw', label: 'Credits', action: () => navigateTo('withdrawal') },
    { key: 'saved', icon: 'saved', label: 'Saved Gigs', action: () => navigateTo('saved') },
    { key: 'stats', icon: 'stats', label: 'My Stats', action: () => navigateTo('stats') },
    { key: 'settings', icon: 'settings', label: 'Settings', action: () => navigateTo('settings') },
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
    // chat is always mounted below (persistent wrapper)
    referral: <ReferralScreen />,
    wallet: <WalletScreen />,
    commission: <CommissionScreen />,
    withdrawal: <WithdrawalScreen />,
    notifications: <NotificationsScreen onNavigate={navigateTo} />,
  }

  return (
    <div ref={appRef} className="prima-app-shell" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      position: 'fixed',
      top: 0, left: 0, right: 0,
      overflow: 'hidden',
      background: 'var(--color-page)',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>

      {/* TOP BAR */}
      <div style={{
        height: '64px',
        background: 'var(--color-surface)',
        borderBottom: '1.5px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 9500
      }} className="app-topbar">
        {/* Logo */}
        <div className="topbar-brand" style={{ display: 'flex', alignItems: 'center' }}>
          <div className="app-logo-text" style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>PrimaPlug</div>
        </div>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', gap: '4px' }} className="desktop-nav">
          {navItems.map(item => (
            <button key={item.key} className="app-nav-button" onClick={() => { navigateTo(item.key); setShowMobileMore(false) }}
              style={{
                background: screen === item.key ? 'var(--color-brand-soft)' : 'transparent',
                border: `1.5px solid ${screen === item.key ? 'var(--color-brand-border-strong)' : 'transparent'}`,
                borderRadius: '10px',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: screen === item.key ? '700' : '500',
                color: screen === item.key ? 'var(--color-brand)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
                position: 'relative'
              }}>
              {item.emoji
                ? <span style={{ fontSize: '18px', lineHeight: '1' }}>{item.emoji}</span>
                : <BrandIcon name={item.icon} size={28} active={screen === item.key} />
              }
              {item.label}
              {item.key === 'mygigs' && hasUnpaidCommissions && (
                <span style={{
                  position: 'absolute', top: '6px', right: '6px',
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: 'var(--color-danger-accent)', border: '1.5px solid #fff'
                }} />
              )}
            </button>
          ))}
        </div>

        {/* Right Actions */}
        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Expanded mobile search control */}
          <button
            onClick={() => setShowSearch(true)}
            className="mobile-search-btn"
            style={{
              background: 'var(--color-page)',
              border: '1.5px solid var(--color-border)',
              borderRadius: '10px',
              width: '40px', height: '40px',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '9px',
              padding: '0 10px',
              cursor: 'pointer',
              flexShrink: 0,
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--color-text-subtle)',
              whiteSpace: 'nowrap',
              overflow: 'hidden'
            }}>
            <BrandIcon name="search" size={26} active={false} />
            <span>Search gigs, people...</span>
          </button>
          <NotificationBell onNavigate={(screen) => navigateTo(screen)} active={screen === 'notifications'} />
          <button
            onClick={() => setShowSearch(true)}
            className="desktop-action"
            style={{
              background: 'var(--color-page)',
              border: '1.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontFamily: 'inherit',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
              e.currentTarget.style.color = 'var(--color-brand)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}>
            <BrandIcon name="search" size={30} />
            <span className="search-label">Search</span>
            <span style={{
              background: 'var(--color-border)', borderRadius: '5px',
              padding: '1px 6px', fontSize: '12px',
              color: 'var(--color-text-subtle)', fontWeight: '700'
            }}>⌘K</span>
          </button>
          <button
            onClick={() => setShowMobileMore(m => !m)}
            className="mobile-more-trigger"
            style={{
              background: showMobileMore ? 'var(--color-brand-soft)' : 'var(--color-page)',
              border: `1.5px solid ${showMobileMore ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
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
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
              <rect x="0" y="0" width="20" height="2.2" rx="1.1" fill={showMobileMore ? 'var(--color-brand)' : 'var(--color-text-muted)'} />
              <rect x="0" y="5.9" width="20" height="2.2" rx="1.1" fill={showMobileMore ? 'var(--color-brand)' : 'var(--color-text-muted)'} />
              <rect x="0" y="11.8" width="20" height="2.2" rx="1.1" fill={showMobileMore ? 'var(--color-brand)' : 'var(--color-text-muted)'} />
            </svg>
          </button>
        </div>
      </div>

      {showMobileMore && (
        <>
          {/* Invisible backdrop — tap anywhere outside to close */}
          <div
            className="mobile-more-menu"
            onClick={() => setShowMobileMore(false)}
            style={{
              display: 'none',
              position: 'fixed',
              inset: 0,
              zIndex: 9599,
            }}
          />
          <div
            className="mobile-more-menu"
            style={{
              display: 'none',
              position: 'fixed',
              top: '62px',
              right: '12px',
              width: '220px',
              background: 'var(--color-surface)',
              border: '1.5px solid var(--color-border)',
              borderRadius: '16px',
              boxShadow: '0 16px 44px rgba(108,71,255,0.18)',
              zIndex: 9600,
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
                background: screen === item.key ? 'var(--color-surface-tint)' : 'var(--color-surface)',
                border: 'none',
                borderBottom: '1px solid var(--color-page)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
                  {item.emoji ? (
                <span style={{
                  width: 38, height: 38, borderRadius: '10px',
                  background: screen === item.key ? 'var(--color-brand-soft)' : 'var(--color-page)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '20px', flexShrink: 0
                }}>{item.emoji}</span>
              ) : (
                <BrandIcon name={item.icon} size={38} active={screen === item.key || item.key === 'search'} />
              )}
              <span style={{
                fontSize: '13px',
                fontWeight: '700',
                color: screen === item.key ? 'var(--color-brand)' : 'var(--color-text)'
              }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
        </>
      )}

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }} className="app-body">

        {/* SIDEBAR - desktop only */}
        <div style={{
          width: '72px',
          background: 'var(--color-surface)',
          borderRight: '1.5px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: '4px',
          flexShrink: 0
        }} className="desktop-sidebar">

          {/* Saved Gigs */}
          <button
            onClick={() => navigateTo('saved')}
            title="Saved Gigs"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'saved' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'saved' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'saved') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="saved" size={36} active={screen === 'saved'} />
            <span style={{ fontSize: '12px', fontWeight: '600', color: screen === 'saved' ? 'var(--color-brand)' : 'var(--color-text-subtle)' }}>Saved</span>
          </button>

          {/* My Stats */}
          <button
            onClick={() => navigateTo('stats')}
            title="My Stats"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'stats' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'stats' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'stats') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="stats" size={36} active={screen === 'stats'} />
            <span style={{ fontSize: '12px', fontWeight: '600', color: screen === 'stats' ? 'var(--color-brand)' : 'var(--color-text-subtle)' }}>Stats</span>
          </button>

          {/* Referral */}
          <button
            onClick={() => navigateTo('referral')}
            title="Refer & Earn"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'referral' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'referral' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'referral') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="refer" size={36} active={screen === 'referral'} />
            <span style={{
              fontSize: '12px', fontWeight: '600',
              color: screen === 'referral' ? 'var(--color-brand)' : 'var(--color-text-subtle)'
            }}>Refer</span>
          </button>

          {/* Wallet */}
          <button
            onClick={() => navigateTo('wallet')}
            title="Wallet"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'wallet' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'wallet' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'wallet') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="wallet" size={36} active={screen === 'wallet'} />
            <span style={{
              fontSize: '12px', fontWeight: '600',
              color: screen === 'wallet' ? 'var(--color-brand)' : 'var(--color-text-subtle)'
            }}>Wallet</span>
          </button>

          {/* Withdraw Credits */}
          <button
            onClick={() => navigateTo('withdrawal')}
            title="Credits"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'withdrawal' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'withdrawal' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'withdrawal') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="withdraw" size={36} active={screen === 'withdrawal'} />
            <span style={{
              fontSize: '12px', fontWeight: '600',
              color: screen === 'withdrawal' ? 'var(--color-brand)' : 'var(--color-text-subtle)'
            }}>Credits</span>
          </button>

          {/* Commission / Owed */}
          <button
            onClick={() => navigateTo('commission')}
            title="Commission Owed"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'commission' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'commission' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit',
              position: 'relative'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'commission') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="owed" size={36} active={screen === 'commission'} />
            <span style={{
              fontSize: '12px', fontWeight: '600',
              color: screen === 'commission' ? 'var(--color-brand)' : 'var(--color-text-subtle)'
            }}>Owed</span>
            {hasUnpaidCommissions && (
              <span style={{
                position: 'absolute', top: '4px', right: '6px',
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--color-danger-accent)', border: '1.5px solid #fff'
              }} />
            )}
          </button>

          {/* Divider */}
          <div style={{
            width: '32px', height: '1px',
            background: 'var(--color-border)', margin: '6px 0'
          }} />

          {/* Settings */}
          <button
            onClick={() => navigateTo('settings')}
            title="Settings"
            style={{
              width: '56px', height: '58px',
              borderRadius: '12px',
              background: screen === 'settings' ? 'var(--color-brand-soft)' : 'transparent',
              border: `1.5px solid ${screen === 'settings' ? 'var(--color-brand-border-strong)' : 'transparent'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '3px', cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'inherit'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-brand-soft)'
              e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
            }}
            onMouseLeave={e => {
              if (screen !== 'settings') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}>
            <BrandIcon name="settings" size={36} active={screen === 'settings'} />
            <span style={{ fontSize: '12px', fontWeight: '600', color: screen === 'settings' ? 'var(--color-brand)' : 'var(--color-text-subtle)' }}>Settings</span>
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Admin — only visible to admins */}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              title="Admin Dashboard"
              style={{
                width: '48px', height: '48px',
                borderRadius: '12px',
                background: 'var(--color-danger-soft)',
                border: '1.5px solid var(--color-danger-border)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '3px', cursor: 'pointer',
                fontFamily: 'inherit', marginBottom: '6px'
              }}>
              <span style={{ fontSize: '18px' }}>⚙️</span>
              <span style={{
                fontSize: '12px', fontWeight: '700',
                color: 'var(--color-danger)'
              }}>Admin</span>
            </button>
          )}

          {/* Post Gig — Primary CTA */}
          <button
            onClick={() => setShowPost(true)}
            title="Post a Gig"
            style={{
              width: '48px', height: '48px',
              borderRadius: '12px',
              background: 'var(--color-brand-gradient)',
              border: 'none', color: 'var(--color-surface)',
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

          {/* Profile Completion Banner */}
          {!loading && user && (() => {
            const { score } = getProfileCompletion(profile)
            if (!profile || score >= 100) return null
            return (
              <div style={{
                background: 'linear-gradient(135deg, var(--color-brand-soft), var(--color-brand-pale))',
                border: '1.5px solid var(--color-brand-border-strong)',
                borderRadius: '14px',
                padding: '12px 16px',
                margin: '12px 16px 0',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '12px',
                cursor: 'pointer'
              }} onClick={() => navigateTo('profile')}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '10px',
                    background: 'var(--color-brand-gradient)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <BrandIcon name="profile" size={22} active={true} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '12px', fontWeight: '700',
                      color: 'var(--color-text)', marginBottom: '4px'
                    }}>
                      Build your profile — {score}% complete
                    </div>
                    <div style={{
                      height: '4px', background: 'var(--color-border)',
                      borderRadius: '2px', overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        width: `${score}%`,
                        background: 'linear-gradient(90deg, var(--color-brand), var(--color-brand-mid))'
                      }} />
                    </div>
                  </div>
                </div>
                <div style={{
                  background: 'var(--color-brand)', color: 'var(--color-surface)',
                  borderRadius: '8px', padding: '6px 12px',
                  fontSize: '13px', fontWeight: '700',
                  whiteSpace: 'nowrap', flexShrink: 0
                }}>Finish →</div>
              </div>
            )
          })()}

          {pendingGigReferral && (
  <div style={{
    background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-highlight))',
    borderRadius: '14px', padding: '14px 16px',
    margin: '12px 16px 0', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center',
    gap: '12px', cursor: 'pointer', color: 'var(--color-surface)'
  }} onClick={() => {
    window.dispatchEvent(new CustomEvent('openGigDetail', { detail: pendingGigReferral.gigId }))
    setPendingGigReferral(null)
  }}>
    <div>
      <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '2px' }}>
        🎁 You were invited to a gig!
      </div>
      <div style={{ fontSize: '13px', opacity: 0.85 }}>
        Tap to view it and apply
      </div>
    </div>
    <div style={{
      background: 'rgba(255,255,255,0.25)', borderRadius: '8px',
      padding: '6px 12px', fontSize: '13px', fontWeight: '700',
      whiteSpace: 'nowrap'
    }}>View →</div>
  </div>
)}

          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: screen === 'map' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            position: 'relative',
          }} className="screen-scroll">
            {/* Chat — always mounted so it never shows blank on navigate */}
            <div className="chat-persistent-wrapper" style={{
              display: screen === 'chat' ? 'flex' : 'none',
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              flexDirection: 'column',
            }}>
              <ChatScreen />
            </div>
            {screen !== 'chat' && screens[screen]}
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div style={{
        display: 'none',
        background: 'var(--color-surface)',
        borderTop: '1.5px solid var(--color-border)',
        padding: '6px 4px 16px',
        justifyContent: 'space-around',
        alignItems: 'center',
        flexShrink: 0,
        zIndex: 50
      }} className="mobile-nav">
        {[
          { key: 'map', icon: 'home', label: 'Home' },
          { key: 'feed', icon: 'feed', label: 'Feed' },
          { key: 'mygigs', icon: 'mygigs', label: 'My Gigs' },
          { key: 'chat', icon: 'chat', label: 'Chat' },
          { key: 'profile', icon: 'profile', label: 'Profile' },
        ].map(item => {
          const active = screen === item.key
          return (
            <button
              key={item.key}
              onClick={() => { navigateTo(item.key); setShowMobileMore(false) }}
              style={{
                flex: '1 1 0', minWidth: 0,
                background: 'transparent', border: 'none',
                padding: '4px 2px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '3px', cursor: 'pointer', fontFamily: 'inherit'
              }}>
              <div style={{
                width: '52px', height: '44px', borderRadius: '12px',
                background: active ? 'var(--color-brand-soft)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', position: 'relative'
              }}>
                {item.emoji
                  ? <span style={{ fontSize: active ? '28px' : '26px', lineHeight: '1', filter: active ? 'none' : 'grayscale(20%)' }}>{item.emoji}</span>
                  : <BrandIcon name={item.icon} size={40} active={active} />
                }
                {item.key === 'mygigs' && hasUnpaidCommissions && (
                  <span style={{
                    position: 'absolute', top: '4px', right: '6px',
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: 'var(--color-danger-accent)', border: '1.5px solid #fff'
                  }} />
                )}
              </div>
              <span style={{
                fontSize: '12px', fontWeight: active ? '700' : '500',
                color: active ? 'var(--color-brand)' : 'var(--color-text-subtle)', lineHeight: '1'
              }}>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* MOBILE FAB — hidden on chat screen to avoid covering the input */}
      {screen !== 'chat' && (
        <button onClick={() => setShowPost(true)}
          style={{
            position: 'fixed',
            bottom: '88px',
            right: '16px',
            zIndex: 60,
            width: '52px', height: '52px',
            borderRadius: '50%',
            background: 'var(--color-brand-gradient)',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(108,71,255,0.5)',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit'
          }} className="mobile-fab">
          <BrandIcon name="post" size={36} />
        </button>
      )}

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
          .topbar-brand { display: none !important; }
          .topbar-actions { flex: 1 1 auto !important; min-width: 0 !important; }
          .mobile-search-btn { display: flex !important; flex: 1 1 auto !important; width: auto !important; min-width: 0 !important; }
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
          .chat-persistent-wrapper {
            bottom: 96px !important;
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
          .mobile-fab {
            bottom: calc(82px + env(safe-area-inset-bottom)) !important;
            right: 16px !important;
          }
          .floating-chat-shell {
            display: none !important;
          }
        }
        @media (max-width: 960px) {
          .desktop-nav { display: none !important; }
        }
        @media (max-width: 767px) {
          .chat-keyboard-open .mobile-nav { display: none !important; }
          .chat-keyboard-open .screen-scroll { padding-bottom: 0 !important; }
          .chat-keyboard-open .chat-persistent-wrapper { bottom: 0 !important; }
        }
      `}</style>

      {/* Floating Chat — visible on all screens */}
      {screen !== 'chat' && (
  <div className="floating-chat-shell">
    <FloatingChat onOpenFullChat={() => navigateTo('chat')} />
  </div>
)}

      {/* Push Notification Prompt */}
      {showPushPrompt && (
        <div style={{
          position: 'fixed', bottom: '90px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-surface)', borderRadius: '16px',
          padding: '16px 20px', width: '320px',
          boxShadow: '0 8px 32px rgba(108,71,255,0.2)',
          border: '1.5px solid var(--color-border)',
          zIndex: 8500,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          animation: 'slideUp 0.3s ease'
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'var(--color-brand-soft)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', flexShrink: 0
            }}>🔔</div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '13px', fontWeight: '700',
                color: 'var(--color-text)', marginBottom: '3px'
              }}>Stay in the loop</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                lineHeight: '1.5', marginBottom: '10px'
              }}>
                Get notified about applications, messages and gig updates even when the app is closed.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={async () => {
                    setShowPushPrompt(false)
                    await initPushNotifications(user.id)
                  }}
                  style={{
                    flex: 2,
                    background: 'var(--color-brand-gradient)',
                    border: 'none', borderRadius: '8px', padding: '8px',
                    fontSize: '12px', fontWeight: '700', color: 'var(--color-surface)',
                    cursor: 'pointer', fontFamily: 'inherit'
                  }}>Enable Notifications</button>
                <button
                  onClick={() => setShowPushPrompt(false)}
                  style={{
                    flex: 1, background: 'var(--color-page)',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: '8px', padding: '8px',
                    fontSize: '12px', fontWeight: '600',
                    color: 'var(--color-text-muted)', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>Not now</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfilePrompt && (
        <ProfilePrompt
          profile={profile}
          onClose={() => setShowProfilePrompt(false)}
          onGoToProfile={() => {
            setShowProfilePrompt(false)
            navigateTo('profile')
          }}
        />
      )}
    </div>
  )
}
