import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import LegalPage from './pages/LegalPage'
import PublicProfile from './components/PublicProfile'
import { LanguageProvider } from './context/LanguageContext'
import { CreditsProvider } from './context/CreditsContext'
import { captureReferralCode, captureGigReferral } from './utils/referral'
import { needsProfileSetup } from './utils/profileComplete'

function AppLoader({ message }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: '24px',
      background: 'var(--color-surface-tint)', fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ position: 'relative', width: '96px', height: '96px' }}>
        <div style={{
          position: 'absolute', inset: 0,
          border: '4px solid var(--color-border)',
          borderTop: '4px solid var(--color-brand)',
          borderRadius: '50%',
          animation: 'primaspin 0.8s linear infinite',
          boxSizing: 'border-box',
        }} />
        <img src="/prima-logo.png" alt="PrimaPlug" style={{
          position: 'absolute',
          top: '12px', left: '12px',
          width: '72px', height: '72px',
          borderRadius: '18px',
          objectFit: 'contain',
        }} />
      </div>
      {message && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: '600', textAlign: 'center', maxWidth: '220px', lineHeight: '1.5' }}>
          {message}
        </div>
      )}
      <style>{`@keyframes primaspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function AuthCallback() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
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

            // The server limits delivery to recently created Google accounts
            // and records each send, so invoking on callbacks also permits a
            // retry after a temporary email-provider failure.
            void supabase.functions.invoke('send-google-welcome-email')
              .then(({ error: welcomeEmailError }) => {
                if (welcomeEmailError) console.warn('Google welcome email could not be sent:', welcomeEmailError.message)
              })
              .catch(error => console.warn('Google welcome email request failed:', error))

            // Check if Prima profile exists
            const { data: profile } = await supabase
              .from('users')
              .select('id, full_name, username, skills')
              .eq('id', userId)
              .maybeSingle()

            if (!profile) {
              // Create profile from Google data
              const { error: createProfileError } = await supabase.from('users').insert({
                id: userId,
                full_name: googleName,
                email: googleEmail,
                avatar_url: googleAvatar,
                username: googleEmail.split('@')[0]
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '') +
                  Math.floor(Math.random() * 999),
                trust_score: 0,
                gigs_completed: 0,
                rating: 0,
                reviews_count: 0,
                level: 'new',
                wallet_currency: 'USD'
              })
              if (createProfileError) throw createProfileError

              setMessage('Profile created! Taking you to setup...')
              await refreshProfile(userId)
              setTimeout(() => navigate('/onboarding'), 1000)
            } else if (needsProfileSetup(profile)) {
              setMessage('Finish setting up your profile...')
              await refreshProfile(userId)
              setTimeout(() => navigate('/onboarding'), 1000)
            } else {
              setMessage('Welcome back! Loading Prima...')
              await refreshProfile(userId)
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

  return <AppLoader message={message} />
}

function ProtectedRoute({ children }) {
  const { user, loading, profileLoaded } = useAuth()

  if (loading || (user && !profileLoaded)) return <AppLoader />

  return user ? children : <Navigate to="/" replace />
}

function PublicProfileRoute() {
  const { userId } = useParams()
  return <PublicProfile userId={userId} standalone />
}

function AppRoutes() {
  const { user, profile, loading, profileLoaded } = useAuth()

  useEffect(() => {
    captureReferralCode()
    captureGigReferral()
  }, [])

  if (loading) return <AppLoader />

  return (
    <Routes>
      <Route path="/" element={
        user
          ? !profileLoaded
            ? <AppLoader />
            : <Navigate to={needsProfileSetup(profile) ? '/onboarding' : '/dashboard'} replace />
          : <Auth />
      } />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/confirm" element={<AuthCallback />} />
      <Route path="/privacy" element={<LegalPage type="privacy" />} />
      <Route path="/terms" element={<LegalPage type="terms" />} />
      <Route path="/profile/:userId" element={<PublicProfileRoute />} />
      <Route path="/onboarding" element={
        <ProtectedRoute><Onboarding /></ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>{needsProfileSetup(profile) ? <Navigate to="/onboarding" replace /> : <Dashboard />}</ProtectedRoute>
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
