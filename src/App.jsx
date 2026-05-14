import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import BrandIcon from './components/BrandIcon'
import { LanguageProvider } from './context/LanguageContext'
import { CreditsProvider } from './context/CreditsContext'
import { captureReferralCode, captureGigReferral } from './utils/referral'

function AuthCallback() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Signing you in...')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Handle hash-based OAuth callback (Google, etc.)
        if (window.location.hash) {
          const { data, error } = await supabase.auth.getSession()

          if (error) {
            console.log('Session error:', error)
            setMessage('Something went wrong. Redirecting...')
            setTimeout(() => navigate('/'), 2000)
            return
          }

          if (data.session) {
            const userId = data.session.user.id
            const googleName = data.session.user.user_metadata?.full_name || ''
            const googleAvatar = data.session.user.user_metadata?.avatar_url || ''
            const googleEmail = data.session.user.email || ''

            // Check if Prima profile exists
            const { data: profile } = await supabase
              .from('users')
              .select('id, full_name')
              .eq('id', userId)
              .maybeSingle()

            if (!profile) {
              // Create profile from Google data
              await supabase.from('users').insert({
                id: userId,
                full_name: googleName,
                email: googleEmail,
                avatar_url: googleAvatar,
                username: googleEmail.split('@')[0]
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '') +
                  Math.floor(Math.random() * 999),
                trust_score: 100,
                gigs_completed: 0,
                rating: 5.0,
                reviews_count: 0,
                level: 'new'
              })
              setMessage('Profile created! Taking you to setup...')
              setTimeout(() => navigate('/onboarding'), 1000)
            } else if (!profile.full_name) {
              setMessage('Almost there...')
              setTimeout(() => navigate('/onboarding'), 1000)
            } else {
              setMessage('Welcome back! Loading Prima...')
              setTimeout(() => navigate('/dashboard'), 1000)
            }
            return
          }
        }

        // No hash — check existing session
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          navigate('/dashboard')
        } else {
          navigate('/')
        }
      } catch (e) {
        console.log('Callback error:', e)
        navigate('/')
      }
    }

    handleCallback()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column',
      gap: '16px', background: '#F8F7FF',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        width: '64px', height: '64px',
        borderRadius: '18px',
        background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '32px',
        boxShadow: '0 8px 32px rgba(108,71,255,0.4)'
      }}>⚡</div>
      <div style={{
        fontSize: '24px', fontWeight: '800', color: '#14123A'
      }}>PrimaPlug</div>
      <div style={{
        fontSize: '14px', color: '#8B8FAF',
        textAlign: 'center', maxWidth: '240px',
        lineHeight: '1.5'
      }}>{message}</div>
      <div style={{
        width: '120px', height: '4px',
        borderRadius: '2px', background: '#E2E0FF',
        overflow: 'hidden', marginTop: '8px'
      }}>
        <div style={{
          height: '100%', background: 'linear-gradient(90deg, #6C47FF, #9B59FF)',
          borderRadius: '2px',
          animation: 'loading 1.2s ease infinite'
        }} />
      </div>
      <style>{`
        @keyframes loading {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#F8F7FF', flexDirection: 'column', gap: '16px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '28px'
      }}>⚡</div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A' }}>
        PrimaPlug
      </div>
      <div style={{ fontSize: '13px', color: '#A09DC8' }}>Loading...</div>
    </div>
  )

  return user ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()

  useEffect(() => {
    captureReferralCode()
    captureGigReferral()
  }, [])

  if (loading) return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F5F4FF',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px',
          borderRadius: '12px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px'
        }}>
          <BrandIcon name="map" size={48} />
        </div>
        <div style={{ fontSize: '14px', color: '#8B8FAF', fontWeight: '600' }}>
          Loading Prima...
        </div>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={
        user ? <Navigate to="/dashboard" replace /> : <Auth />
      } />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/confirm" element={<AuthCallback />} />
      <Route path="/onboarding" element={
        <ProtectedRoute><Onboarding /></ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute><Admin /></ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <CreditsProvider>
            <AppRoutes />
          </CreditsProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
