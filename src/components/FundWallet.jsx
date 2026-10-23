import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { edgeFunctionErrorMessage } from '../utils/edgeFunctionErrors'

const SUPPORTED_CURRENCIES = [
  { code: 'NGN', label: 'Nigerian Naira', symbol: '₦' },
  { code: 'GHS', label: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'KES', label: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'UGX', label: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'ZAR', label: 'South African Rand', symbol: 'R' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
]

export default function FundWallet({ onClose, initialCurrency }) {
  const { user, profile } = useAuth()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(initialCurrency || 'NGN')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

      if (fnError) throw new Error(await edgeFunctionErrorMessage(fnError, 'Could not start wallet funding. Please try again.'))
      if (data?.error) throw new Error(data.error)

      window.location.href = data.checkoutUrl

    } catch (e) {
      console.error('Fund wallet error:', e)
      setError(e.message || 'Could not start wallet funding. Please try again.')
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
        background: 'var(--color-surface)', borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        padding: '20px', paddingBottom: '32px'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: 'var(--color-border)', borderRadius: '2px',
          margin: '0 auto 20px'
        }} />

        <div style={{
          fontSize: '18px', fontWeight: '800',
          color: 'var(--color-text)', marginBottom: '4px'
        }}>Fund Your Wallet</div>
        <div style={{
          fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px'
        }}>
          Add money to pay workers instantly through Prima
        </div>

        {/* Currency selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.5px',
            display: 'block', marginBottom: '6px'
          }}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{
              width: '100%', padding: '12px',
              borderRadius: '10px', border: '1.5px solid var(--color-border)',
              fontSize: '14px', fontFamily: 'inherit',
              background: 'var(--color-surface)',
              color: 'var(--color-text)'
            }}>
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code} — {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)',
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
              borderRadius: '10px', border: '1.5px solid var(--color-border)',
              fontSize: '20px', fontWeight: '700', fontFamily: 'inherit',
              color: 'var(--color-text)'
            }}
          />
        </div>

        {error && (
          <div style={{
            background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
            borderRadius: '10px', padding: '10px 12px',
            fontSize: '12px', color: 'var(--color-danger)',
            fontWeight: '600', marginBottom: '14px'
          }}>{error}</div>
        )}

        <button
          onClick={handleFund}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
            border: 'none', borderRadius: '12px', padding: '14px',
            fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
          }}>
          {loading ? 'Redirecting to Fincra...' : 'Continue to Payment →'}
        </button>

        <div style={{
          fontSize: '12px', color: 'var(--color-text-subtle)', textAlign: 'center',
          marginTop: '12px'
        }}>
          🔒 Secured by Fincra
        </div>
      </div>
    </div>
  )
}
