import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { getCurrency } from '../../data/currencies'
import { startFincraWalletFunding } from '../../utils/fincra'

export default function WalletScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const [amount, setAmount] = useState('')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currencyCode = profile?.wallet_currency || 'NGN'
  const currency = getCurrency(currencyCode)
  const walletBalance = Number(profile?.wallet_balance || 0)
  const heldBalance = Number(profile?.held_balance || 0)

  const fetchTransactions = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    setTransactions(data || [])
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = setTimeout(fetchTransactions, 0)

    const channel = supabase
      .channel('wallet-' + user.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wallet_transactions',
        filter: `user_id=eq.${user.id}`
      }, () => {
        fetchTransactions()
        refreshProfile()
      })
      .subscribe()

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [fetchTransactions, refreshProfile, user])

  const fundWallet = async () => {
    const value = Number(amount)
    setError('')
    if (!value || value <= 0) {
      setError('Enter an amount to fund.')
      return
    }

    setLoading(true)
    try {
      const response = await startFincraWalletFunding(supabase, {
        amount: value,
        currency: currencyCode,
        email: user.email,
        name: profile?.full_name || user.email,
        user_id: user.id,
      })

      const checkoutUrl = response?.checkout_url || response?.payment_link || response?.url
      if (!checkoutUrl) throw new Error('Fincra did not return a checkout URL.')
      window.location.href = checkoutUrl
    } catch (e) {
      setError(e.message || 'Could not start wallet funding.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ marginBottom: '22px' }}>
        <div style={{
          fontSize: '22px',
          fontWeight: '800',
          color: '#14123A',
          marginBottom: '4px'
        }}>Wallet</div>
        <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
          Fund gigs, hold escrow, and receive worker payouts.
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #14123A, #6C47FF)',
        borderRadius: '20px',
        padding: '20px',
        color: '#fff',
        marginBottom: '18px'
      }}>
        <div style={{ fontSize: '11px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Available
        </div>
        <div style={{ fontSize: '42px', fontWeight: '800', marginBottom: '10px' }}>
          {currency.symbol}{walletBalance.toLocaleString()}
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          paddingTop: '12px',
          fontSize: '12px'
        }}>
          <span>Held in escrow</span>
          <strong>{currency.symbol}{heldBalance.toLocaleString()}</strong>
        </div>
      </div>

      <div style={{
        background: '#fff',
        border: '1.5px solid #E2E0FF',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '18px'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: '800',
          color: '#A09DC8',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '10px'
        }}>Fund Wallet With Fincra</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`Amount in ${currencyCode}`}
            style={{
              flex: 1,
              minWidth: 0,
              background: '#F5F4FF',
              border: '1.5px solid #E2E0FF',
              borderRadius: '12px',
              padding: '13px 14px',
              fontSize: '14px',
              color: '#14123A',
              fontFamily: 'inherit',
              outline: 'none'
            }}
          />
          <button
            onClick={fundWallet}
            disabled={loading}
            style={{
              background: loading ? '#B8A5FF' : '#00A878',
              border: 'none',
              borderRadius: '12px',
              padding: '0 18px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '800',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit'
            }}
          >
            {loading ? 'Starting...' : 'Fund'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#FF3366', fontWeight: '700' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{
        fontSize: '11px',
        fontWeight: '800',
        color: '#A09DC8',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        marginBottom: '10px'
      }}>Recent Wallet Activity</div>

      {transactions.length === 0 ? (
        <div style={{
          background: '#fff',
          border: '1.5px solid #E2E0FF',
          borderRadius: '16px',
          padding: '28px',
          textAlign: 'center',
          color: '#8B8FAF',
          fontSize: '13px'
        }}>No wallet transactions yet.</div>
      ) : transactions.map(tx => (
        <div key={tx.id} style={{
          background: '#fff',
          border: '1.5px solid #E2E0FF',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#14123A', marginBottom: '3px' }}>
              {tx.description || tx.type.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
              {new Date(tx.created_at).toLocaleString()}
            </div>
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '800',
            color: tx.type === 'escrow_lock' || tx.type === 'withdrawal' ? '#FF6B2B' : '#00A878'
          }}>
            {tx.type === 'escrow_lock' || tx.type === 'withdrawal' ? '-' : '+'}
            {getCurrency(tx.currency || currencyCode).symbol}{Number(tx.amount || 0).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}
