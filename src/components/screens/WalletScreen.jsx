import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { getCurrency } from '../../data/currencies'
import { startFincraWalletFunding, requestFincraPayout, listFincraBanks, verifyFincraAccount } from '../../utils/fincra'

const SUPPORTED_WALLET_CURRENCIES = ['NGN', 'GHS', 'KES', 'UGX', 'ZAR', 'USD']

export default function WalletScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const [amount, setAmount] = useState('')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [selectedCurrency, setSelectedCurrency] = useState(profile?.wallet_currency || 'NGN')
  const currencyLocked = Number(profile?.wallet_balance || 0) > 0
  const currencyCode = currencyLocked ? (profile?.wallet_currency || 'NGN') : selectedCurrency
  const currency = getCurrency(currencyCode)
  const walletBalance = Number(profile?.wallet_balance || 0)
  const heldBalance = Number(profile?.held_balance || 0)

  const [showWithdraw, setShowWithdraw] = useState(false)
  const [banks, setBanks] = useState([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [verifiedName, setVerifiedName] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')

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
      if (!currencyLocked) {
        await supabase.from('users').update({ wallet_currency: currencyCode }).eq('id', user.id)
      }

      const response = await startFincraWalletFunding(supabase, {
        amount: value,
        currency: currencyCode,
        email: user.email,
        name: profile?.full_name || user.email,
        user_id: user.id,
      })

      if (!response?.checkoutUrl) throw new Error('Fincra did not return a checkout URL.')
      window.location.href = response.checkoutUrl
    } catch (e) {
      setError(e.message || 'Could not start wallet funding.')
    }
    setLoading(false)
  }

  const openWithdraw = async () => {
    setShowWithdraw(true)
    setWithdrawError('')
    if (banks.length === 0) {
      try {
        const data = await listFincraBanks(supabase, 'NG')
        const list = data?.data?.banks || data?.banks || (Array.isArray(data) ? data : [])
        setBanks(list)
      } catch (e) {
        console.error('Load banks error:', e)
      }
    }
  }

  const verifyWithdrawAccount = async () => {
    setWithdrawError('')
    setVerifiedName('')
    if (!accountNumber || accountNumber.length < 10 || !bankCode) {
      setWithdrawError('Enter a valid account number and select a bank')
      return
    }
    setVerifying(true)
    try {
      const data = await verifyFincraAccount(supabase, accountNumber, bankCode)
      const accountData = data?.data
      if (!accountData) {
        setWithdrawError('Could not find this account. Check the details.')
      } else {
        setVerifiedName(accountData.accountName || accountData.account_name || 'Verified')
      }
    } catch (e) {
      setWithdrawError(e.message || 'Could not verify account')
    }
    setVerifying(false)
  }

  const submitWithdraw = async () => {
    setWithdrawError('')
    const value = Number(withdrawAmount)
    if (!value || value <= 0) {
      setWithdrawError('Enter a valid amount')
      return
    }
    if (value > walletBalance) {
      setWithdrawError('Amount exceeds your wallet balance')
      return
    }
    if (!verifiedName) {
      setWithdrawError('Please verify the account first')
      return
    }

    setWithdrawing(true)
    try {
      await requestFincraPayout(supabase, {
        userId: user.id,
        source: 'wallet',
        amount: value,
        currency: currencyCode,
        accountNumber,
        bankCode,
        accountName: verifiedName,
        email: user.email,
      })

      refreshProfile()
      setShowWithdraw(false)
      setWithdrawAmount('')
      setAccountNumber('')
      setVerifiedName('')
      setBankCode('')
    } catch (e) {
      setWithdrawError(e.message || 'Withdrawal failed')
    }
    setWithdrawing(false)
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
        <button
          onClick={openWithdraw}
          style={{
            marginTop: '12px',
            width: '100%',
            background: 'rgba(255,255,255,0.15)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            borderRadius: '12px',
            padding: '11px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: '800',
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}>
          💸 Withdraw
        </button>
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

        {!currencyLocked && (
          <div style={{ marginBottom: '10px' }}>
            <select
              value={selectedCurrency}
              onChange={e => setSelectedCurrency(e.target.value)}
              style={{
                width: '100%',
                background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '12px',
                padding: '11px 14px',
                fontSize: '13px',
                color: '#14123A',
                fontFamily: 'inherit',
                outline: 'none'
              }}>
              {SUPPORTED_WALLET_CURRENCIES.map(c => (
                <option key={c} value={c}>{getCurrency(c).symbol} {c} — {getCurrency(c).name}</option>
              ))}
            </select>
          </div>
        )}
        {currencyLocked && (
          <div style={{ fontSize: '11px', color: '#A09DC8', marginBottom: '8px' }}>
            Wallet locked to {currencyCode} since you already have a balance
          </div>
        )}

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

      {showWithdraw && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          zIndex: 9999, display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center'
        }} onClick={() => setShowWithdraw(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: '540px', padding: '20px', paddingBottom: '32px'
          }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#14123A', marginBottom: '16px' }}>
              Withdraw from Wallet
            </div>

            <select
              value={bankCode}
              onChange={e => { setBankCode(e.target.value); setVerifiedName('') }}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #E2E0FF', marginBottom: '10px', fontFamily: 'inherit' }}>
              <option value="">Select bank</option>
              {banks.map((b, i) => <option key={i} value={b.code}>{b.name}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                value={accountNumber}
                onChange={e => { setAccountNumber(e.target.value); setVerifiedName('') }}
                placeholder="Account number"
                maxLength={10}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid #E2E0FF', fontFamily: 'inherit' }}
              />
              <button onClick={verifyWithdrawAccount} disabled={verifying} style={{
                padding: '0 16px', background: '#6C47FF', color: '#fff', border: 'none',
                borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit'
              }}>{verifying ? '...' : 'Verify'}</button>
            </div>

            {verifiedName && (
              <div style={{ background: '#DFFDF4', borderRadius: '10px', padding: '10px', marginBottom: '10px', color: '#00A878', fontWeight: '700', fontSize: '13px' }}>
                ✓ {verifiedName}
              </div>
            )}

            <input
              type="number"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder={`Amount in ${currencyCode}`}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #E2E0FF', marginBottom: '12px', fontSize: '18px', fontWeight: '700', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />

            {withdrawError && (
              <div style={{ background: '#FFE8EE', borderRadius: '10px', padding: '10px', marginBottom: '12px', color: '#FF3366', fontSize: '12px', fontWeight: '600' }}>
                {withdrawError}
              </div>
            )}

            <button
              onClick={submitWithdraw}
              disabled={withdrawing || !verifiedName}
              style={{
                width: '100%', padding: '14px',
                background: (withdrawing || !verifiedName) ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', color: '#fff', fontWeight: '700',
                fontSize: '14px', cursor: (withdrawing || !verifiedName) ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
              }}>
              {withdrawing ? 'Processing...' : 'Withdraw →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}