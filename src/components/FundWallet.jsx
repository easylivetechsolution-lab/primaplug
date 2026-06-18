import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

const SUPPORTED_CURRENCIES = [
  { code: 'NGN', label: 'Nigerian Naira', symbol: '₦' },
  { code: 'GHS', label: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'KES', label: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'UGX', label: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'ZAR', label: 'South African Rand', symbol: 'R' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
]

export default function FundWallet({ onClose }) {
  const { user, profile, refreshProfile } = useAuth()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(profile?.wallet_currency || 'NGN')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Lock currency selection if user already has a wallet balance,
  // to avoid mixing currencies in one balance field
  const currencyLocked = (profile?.wallet_balance || 0) > 0

  const handleFund = async () => {
    setError('')
    const numAmount = parseFloat(amount)

    if (!numAmount || numAmount <= 0) {
      setError('Enter a valid amount')
      return
    }

    setLoading(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fincra-fund-wallet', {
        body: {
          userId: user.id,
          amount: numAmount,
          currency: currency,
          email: user.email,
          name: profile?.full_name || 'Prima User',
        },
      })

      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)

      if (!currencyLocked) {
        await supabase
          .from('users')
          .update({ wallet_currency: currency })
          .eq('id', user.id)
      }

      // Redirect to Fincra's hosted checkout page
      window.location.href = data.checkoutUrl

    } catch (e) {
      console.error('Fund wallet error:', e)
      setError(e.message || 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        padding: '20px', paddingBottom: '32px'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '0 auto 20px'
        }} />

        <div style={{
          fontSize: '18px', fontWeight: '800',
          color: '#14123A', marginBottom: '4px'
        }}>Fund Your Wallet</div>
        <div style={{
          fontSize: '13px', color: '#8B8FAF', marginBottom: '20px'
        }}>
          Add money to pay workers instantly through Prima
        </div>

        {/* Currency selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            fontSize: '11px', fontWeight: '700', color: '#8B8FAF',
            textTransform: 'uppercase', letterSpacing: '0.5px',
            display: 'block', marginBottom: '6px'
          }}>Currency</label>
          <select
            value={currency}
            disabled={currencyLocked}
            onChange={(e) => setCurrency(e.target.value)}
            style={{
              width: '100%', padding: '12px',
              borderRadius: '10px', border: '1.5px solid #E2E0FF',
              fontSize: '14px', fontFamily: 'inherit',
              background: currencyLocked ? '#F5F4FF' : '#fff',
              color: '#14123A'
            }}>
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code} — {c.label}
              </option>
            ))}
          </select>
          {currencyLocked && (
            <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '4px' }}>
              Your wallet currency is locked to {profile?.wallet_currency} since you already have a balance
            </div>
          )}
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            fontSize: '11px', fontWeight: '700', color: '#8B8FAF',
            textTransform: 'uppercase', letterSpacing: '0.5px',
            display: 'block', marginBottom: '6px'
          }}>Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              width: '100%', padding: '12px',
              borderRadius: '10px', border: '1.5px solid #E2E0FF',
              fontSize: '20px', fontWeight: '700', fontFamily: 'inherit',
              color: '#14123A'
            }}
          />
        </div>

        {error && (
          <div style={{
            background: '#FFE8EE', border: '1.5px solid #FF99B3',
            borderRadius: '10px', padding: '10px 12px',
            fontSize: '12px', color: '#FF3366',
            fontWeight: '600', marginBottom: '14px'
          }}>{error}</div>
        )}

        <button
          onClick={handleFund}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '12px', padding: '14px',
            fontSize: '14px', fontWeight: '700', color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
          }}>
          {loading ? 'Redirecting to Fincra...' : 'Continue to Payment →'}
        </button>

        <div style={{
          fontSize: '11px', color: '#A09DC8', textAlign: 'center',
          marginTop: '12px'
        }}>
          🔒 Secured by Fincra
        </div>
      </div>
    </div>
  )
}
