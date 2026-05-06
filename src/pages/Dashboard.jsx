import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F4FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: '32px 40px',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(108,71,255,0.12)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎯</div>
        <div style={{ fontSize: '24px', fontWeight: '800', color: '#14123A', marginBottom: '8px' }}>
          Welcome to Prima!
        </div>
        <div style={{ fontSize: '14px', color: '#8B8FAF', marginBottom: '24px' }}>
          {user?.email}
        </div>
        <button onClick={handleLogout} style={{
          background: '#FF3366',
          border: 'none',
          borderRadius: '10px',
          padding: '12px 24px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          fontFamily: 'inherit'
        }}>
          Log Out
        </button>
      </div>
    </div>
  )
}