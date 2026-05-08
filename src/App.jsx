import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import BrandIcon from './components/BrandIcon'

function AuthCallback() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Confirming your account...')

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        setMessage('Something went wrong. Please try again.')
        setTimeout(() => navigate('/'), 2000)
        return
      }

      if (data.session) {
        // Check if onboarding is complete
        const { data: profile } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', data.session.user.id)
          .maybeSingle()

        if (profile?.full_name) {
          navigate('/dashboard')
        } else {
          navigate('/onboarding')
        }
      } else {
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
        width: '56px', height: '56px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '28px'
      }}>⚡</div>
      <div style={{
        fontSize: '20px', fontWeight: '800', color: '#14123A'
      }}>PrimaPlug</div>
      <div style={{
        fontSize: '14px', color: '#8B8FAF', textAlign: 'center'
      }}>{message}</div>
      <div style={{
        width: '40px', height: '4px',
        borderRadius: '2px', background: '#E2E0FF',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%', background: '#6C47FF',
          borderRadius: '2px',
          animation: 'loading 1.5s ease infinite'
        }} />
      </div>
      <style>{`
        @keyframes loading {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 100%; margin-left: 0%; }
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
