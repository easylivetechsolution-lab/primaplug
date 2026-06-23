import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import BrandIcon from '../components/BrandIcon'
import { SUPPORTED_LANGUAGES } from '../data/languages'
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
        <div style={{ textAlign: 'center', marginBottom: 'clamp(12px, 4vw, 24px)' }}>
          <div style={{ marginBottom: '2px' }}>
            <span style={{
              fontSize: 'clamp(30px, 9vw, 44px)', fontWeight: '800',
              color: '#14123A', letterSpacing: '-2px',
              lineHeight: 1,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic'
            }}>Prima</span>
          </div>
          <div style={{ fontSize: '11px', color: '#8B8FAF', marginTop: '2px' }}>Real-Time Labor Network</div>
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
            if (error) alert(error.message)
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
          By continuing you agree to Prima's{' '}
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
    </div>
  )
}
