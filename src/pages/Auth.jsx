import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import BrandIcon from '../components/BrandIcon'
import { SUPPORTED_LANGUAGES } from '../data/languages'
import { showToast } from '../utils/toast'
import { useLanguage } from '../context/LanguageContext'

export default function Auth() {
  const navigate = useNavigate()
  const { language, setLanguage, t } = useLanguage()
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showIOSSteps, setShowIOSSteps] = useState(false)

  const handleSignup = async () => {
    if (!fullName || !email || !password) {
      setError('Please fill in all fields')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) {
      if (error.message.toLowerCase().includes('email')) {
        setError('Could not send confirmation email. Please try again or contact support.')
      } else {
        setError(error.message)
      }
    } else if (data.session) {
      // Email confirmation is disabled — send new user straight to onboarding
      navigate('/onboarding')
    } else {
      setMessage('Account created! Check your email to confirm before logging in.')
    }
    setLoading(false)
  }

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Logged in successfully!')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: 'clamp(16px, 5vw, 32px)',
        width: '100%',
        maxWidth: '350px',
        boxShadow: '0 20px 60px rgba(108,71,255,0.3)'
      }}>
        {/* Language Selector */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '10px', position: 'relative'
        }}>
          <div style={{
            width: 'clamp(44px, 12vw, 56px)', height: 'clamp(44px, 12vw, 56px)', borderRadius: '50%',
            background: '#EEE9FF', border: '1.5px solid #E2E0FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <img
              src="/prima-logo.png"
              alt="PrimaPlug"
              style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)', borderRadius: '10px', objectFit: 'contain' }}
            />
          </div>
          <button
            onClick={() => setShowLangPicker(s => !s)}
            style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '10px', padding: '8px 14px',
              fontSize: '13px', fontWeight: '600', color: '#14123A',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '7px'
            }}>
            <span>{SUPPORTED_LANGUAGES.find(l => l.code === language)?.flag || '🇬🇧'}</span>
            <span>{SUPPORTED_LANGUAGES.find(l => l.code === language)?.native || 'English'}</span>
            <span style={{ fontSize: '10px', color: '#A09DC8' }}>▼</span>
          </button>

          {showLangPicker && (
            <div style={{
              position: 'absolute', top: '44px', right: 0,
              background: '#fff', border: '1.5px solid #E2E0FF',
              borderRadius: '14px', padding: '8px',
              zIndex: 100, minWidth: '200px',
              boxShadow: '0 8px 32px rgba(108,71,255,0.15)',
              maxHeight: '300px', overflowY: 'auto'
            }}>
              <div style={{
                fontSize: '10px', fontWeight: '700', color: '#A09DC8',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                padding: '4px 8px 8px'
              }}>{t('chooseLanguage')}</div>
              {SUPPORTED_LANGUAGES.map(lang => (
                <div
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code)
                    setShowLangPicker(false)
                  }}
                  style={{
                    display: 'flex', gap: '10px', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '10px',
                    cursor: 'pointer', transition: 'background 0.1s',
                    background: language === lang.code ? '#EEE9FF' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                  onMouseLeave={e => e.currentTarget.style.background =
                    language === lang.code ? '#EEE9FF' : 'transparent'}
                >
                  <span style={{ fontSize: '20px' }}>{lang.flag}</span>
                  <div>
                    <div style={{
                      fontSize: '13px', fontWeight: language === lang.code ? '700' : '500',
                      color: language === lang.code ? '#6C47FF' : '#14123A'
                    }}>{lang.native}</div>
                    <div style={{ fontSize: '10px', color: '#A09DC8' }}>{lang.name}</div>
                  </div>
                  {language === lang.code && (
                    <span style={{
                      marginLeft: 'auto', color: '#6C47FF', fontSize: '14px'
                    }}>✓</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'clamp(10px, 4vw, 20px)' }}>
          <div style={{ marginBottom: '4px', lineHeight: 1, textAlign: 'center' }}>
            <span style={{
              fontSize: 'clamp(18px, 5vw, 24px)',
              fontWeight: '900',
              color: '#14123A',
              letterSpacing: '-1.5px',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              lineHeight: 1,
            }}>Prima</span>
          </div>
          <div style={{ fontSize: '10px', color: '#A09DC8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Real-Time Workforce Network
          </div>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'flex',
          background: '#F5F4FF',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '16px'
        }}>
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setMessage(''); }}
              style={{
                flex: 1, padding: '10px',
                background: mode === m ? '#fff' : 'transparent',
                border: 'none', borderRadius: '9px',
                fontSize: '13px', fontWeight: '700',
                color: mode === m ? '#6C47FF' : '#8B8FAF',
                cursor: 'pointer',
                boxShadow: mode === m ? '0 2px 8px rgba(108,71,255,0.15)' : 'none',
                transition: 'all 0.2s',
                fontFamily: 'inherit'
              }}>
              {m === 'login' ? t('signIn') : t('signUp')}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {mode === 'signup' && (
            <input
              placeholder={t('fullName')}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              style={{
                padding: '11px 14px', borderRadius: '10px',
                border: '1.5px solid #E2E0FF', fontSize: '14px',
                outline: 'none', fontFamily: 'inherit', color: '#14123A',
                background: '#F5F4FF'
              }}
            />
          )}
          <input
            placeholder={t('email')}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              padding: '13px 16px', borderRadius: '10px',
              border: '1.5px solid #E2E0FF', fontSize: '14px',
              outline: 'none', fontFamily: 'inherit', color: '#14123A',
              background: '#F5F4FF'
            }}
          />
          <div style={{ position: 'relative' }}>
            <input
              placeholder={t('password')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '11px 44px 11px 14px', borderRadius: '10px',
                border: '1.5px solid #E2E0FF', fontSize: '14px',
                outline: 'none', fontFamily: 'inherit', color: '#14123A',
                background: '#F5F4FF'
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              style={{
                position: 'absolute', right: '12px', top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px', color: '#A09DC8', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}>
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Error / Message */}
        {error && (
          <div style={{ background: '#FFE8EE', border: '1.5px solid #FF99B3', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#FF3366', marginBottom: '16px' }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background: '#DFFDF4', border: '1.5px solid #7EECD2', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#00C48C', marginBottom: '16px' }}>
            {message}
          </div>
        )}

        {/* Google Sign In */}
        <button
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${window.location.origin}/auth/callback`
              }
            })
            if (error) showToast(error.message, 'error')
          }}
          type="button"
          style={{
            width: '100%',
            background: '#fff',
            border: '1.5px solid #E2E0FF',
            borderRadius: '12px',
            padding: '11px',
            fontSize: '13px',
            fontWeight: '600',
            color: '#14123A',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '10px',
            transition: 'all 0.15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#B8A5FF'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,71,255,0.15)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#E2E0FF'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {t('continueWithGoogle')}
        </button>

        {/* Divider */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: '12px', marginBottom: '10px'
        }}>
          <div style={{ flex: 1, height: '1px', background: '#E2E0FF' }} />
          <span style={{ fontSize: '12px', color: '#A09DC8', fontWeight: '500' }}>
            or continue with email
          </span>
          <div style={{ flex: 1, height: '1px', background: '#E2E0FF' }} />
        </div>

        {/* Submit */}
        <button
          onClick={mode === 'login' ? handleLogin : handleSignup}
          disabled={loading}
          style={{
            width: '100%', padding: '12px',
            background: loading ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '12px',
            fontSize: '15px', fontWeight: '700',
            color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(108,71,255,0.4)',
            fontFamily: 'inherit', transition: 'all 0.2s'
          }}>
          {loading ? 'Please wait...' : mode === 'login' ? t('signIn') : t('signUp')}
        </button>

        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '11px', color: '#A09DC8' }}>
          By continuing you agree to PrimaPlug's{' '}
          <Link
            to="/terms"
            style={{ color: '#6C47FF', fontWeight: '700', textDecoration: 'none' }}
          >
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link
            to="/privacy"
            style={{ color: '#6C47FF', fontWeight: '700', textDecoration: 'none' }}
          >
            Privacy Policy
          </Link>
        </div>
      </div>

      {/* ── Download the App ─────────────────────────────────────────────── */}
      <div style={{
        marginTop: '14px',
        width: '100%', maxWidth: '350px',
        boxSizing: 'border-box'
      }}>
        <p style={{
          fontSize: '10px', color: 'rgba(255,255,255,0.55)',
          textAlign: 'center', margin: '0 0 8px',
          textTransform: 'uppercase', letterSpacing: '1px'
        }}>
          Update available — download the latest version
        </p>

        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Android */}
          <a
            href="https://pub-bcdbcd3dbd3148c28060148c0929cc03.r2.dev/app/PrimaPlug-latest.apk"
            download="PrimaPlug.apk"
            style={{
              flex: 1, textDecoration: 'none',
              background: '#fff',
              borderRadius: '14px',
              padding: '12px 10px',
              display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
              <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24A10.27 10.27 0 0 0 12 8c-1.53 0-2.98.35-4.47.91L5.65 5.67a.64.64 0 0 0-.83-.22.64.64 0 0 0-.26.85l1.84 3.18A9.98 9.98 0 0 0 2 17h20a9.98 9.98 0 0 0-4.4-7.52zM8.5 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm7 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" fill="#3DDC84"/>
            </svg>
            <div>
              <div style={{ fontSize: '9px', color: '#8B8FAF', fontWeight: '600' }}>Download for</div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#14123A', lineHeight: 1.2 }}>Android</div>
            </div>
          </a>

          {/* iPhone */}
          <button
            onClick={() => setShowIOSSteps(s => !s)}
            style={{
              flex: 1,
              background: '#fff',
              border: 'none',
              borderRadius: '14px',
              padding: '12px 10px',
              display: 'flex', alignItems: 'center', gap: '10px',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="#14123A">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '9px', color: '#8B8FAF', fontWeight: '600' }}>Add to</div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#14123A', lineHeight: 1.2 }}>iPhone</div>
            </div>
          </button>
        </div>

        {showIOSSteps && (
          <div style={{
            marginTop: '10px',
            background: '#fff',
            borderRadius: '14px',
            padding: '14px 16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#14123A', marginBottom: '10px' }}>
              Add PrimaPlug to your iPhone
            </div>
            {[
              ['1', 'Open this page in Safari', '(Chrome won\'t work)'],
              ['2', 'Tap the Share button', 'at the bottom of Safari (⬜↑)'],
              ['3', 'Tap "Add to Home Screen"', 'scroll down to find it'],
              ['4', 'Tap "Add"', 'it installs like a native app'],
            ].map(([num, title, sub]) => (
              <div key={num} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '800', color: '#fff'
                }}>{num}</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#14123A' }}>{title}</div>
                  <div style={{ fontSize: '10px', color: '#8B8FAF', marginTop: '1px' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
