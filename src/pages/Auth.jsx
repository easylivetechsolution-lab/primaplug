import { useState } from 'react'
import { supabase } from '../supabase'
import BrandIcon from '../components/BrandIcon'

export default function Auth() {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSignup = async () => {
    if (!fullName || !email || !password) {
      setError('Please fill in all fields')
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
      setError(error.message)
    } else {
      setMessage('Check your email to confirm your account!')
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
    const { data, error } = await supabase.auth.signInWithPassword({
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
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '24px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(108,71,255,0.3)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px',
            borderRadius: '16px',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <BrandIcon name="map" size={56} />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#14123A', letterSpacing: '-0.5px' }}>Prima</div>
          <div style={{ fontSize: '13px', color: '#8B8FAF', marginTop: '4px' }}>Real-Time Labor Network</div>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'flex',
          background: '#F5F4FF',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px'
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
              {m === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {mode === 'signup' && (
            <input
              placeholder="Full Name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              style={{
                padding: '13px 16px', borderRadius: '10px',
                border: '1.5px solid #E2E0FF', fontSize: '14px',
                outline: 'none', fontFamily: 'inherit', color: '#14123A',
                background: '#F5F4FF'
              }}
            />
          )}
          <input
            placeholder="Email Address"
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
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              padding: '13px 16px', borderRadius: '10px',
              border: '1.5px solid #E2E0FF', fontSize: '14px',
              outline: 'none', fontFamily: 'inherit', color: '#14123A',
              background: '#F5F4FF'
            }}
          />
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

        {/* Submit */}
        <button
          onClick={mode === 'login' ? handleLogin : handleSignup}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            background: loading ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '12px',
            fontSize: '15px', fontWeight: '700',
            color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(108,71,255,0.4)',
            fontFamily: 'inherit', transition: 'all 0.2s'
          }}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Log In to Prima' : 'Create Account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#A09DC8' }}>
          By continuing you agree to Prima's Terms of Service
        </div>
      </div>
    </div>
  )
}
