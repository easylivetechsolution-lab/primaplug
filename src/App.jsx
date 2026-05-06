import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'

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
          background: 'linear-gradient(135deg, #6C47FF, #FF4DCF)',
          borderRadius: '12px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          margin: '0 auto 12px'
        }}>🗺</div>
        <div style={{ fontSize: '14px', color: '#8B8FAF', fontWeight: '600' }}>
          Loading Prima...
        </div>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={
        !user ? <Auth /> : <Navigate to="/dashboard" />
      } />
      <Route path="/dashboard" element={
        user ? <Dashboard /> : <Navigate to="/" />
      } />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App