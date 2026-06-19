import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { creditsToDollars, MIN_WITHDRAWAL_CREDITS } from '../utils/payments'

export default function Withdrawal({ onClose }) {
  const { user, profile, refreshProfile } = useAuth()

  const [source, setSource] = useState('wallet') // 'wallet' or 'credits'
  const [banks, setBanks] = useState([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [verifiedName, setVerifiedName] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const walletBalance = Number(profile?.wallet_balance || 0)
  const creditsBalance = Number(profile?.credit_balance || 0)
  const creditsAsDollars = creditsToDollars(creditsBalance)

  useEffect(() => {
    loadBanks()
  }, [])

  const loadBanks = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fincra-list-banks', {
        body: {},
      })
      // list-banks uses GET with query param, invoke defaults to POST,
      // so call it directly via fetch instead
      const res = await fetch(
        `https://eiwytpjtrawmocinxpid.supabase.co/functions/v1/fincra-list-banks?country=NG`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      )
      const json = await res.json()
      if (json?.banks) {
        setBanks(json.banks)
      } else if (Array.isArray(json)) {
        setBanks(json)
      }
    } catch (e) {
      console.error('Load banks error:', e)
    }
  }

  const verifyAccount = async () => {
    setVerifyError('')
    setVerifiedName('')

    if (!accountNumber || accountNumber.length < 10 || !bankCode) {
      setVerifyError('Enter a valid 10-digit account number and select a bank')
      return
    }

    setVerifying(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fincra-verify-account', {
        body: { accountNumber, bankCode },
      })

      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)

      const accountData = data?.data
      if (!accountData) {
        setVerifyError('Could not find this account. Double check the number and bank.')
        setVerifying(false)
        return
      }

      setVerifiedName(accountData.accountName || accountData.account_name || 'Account verified')
    } catch (e) {
      console.error('Verify error:', e)
      setVerifyError(e.message || 'Could not verify account')
    }
    setVerifying(false)
  }

  const handleWithdraw = async () => {
    setError('')
    const numAmount = parseFloat(amount)
    const balance = source === 'wallet' ? walletBalance : creditsAsDollars

    if (!numAmount || numAmount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (numAmount > balance) {
      setError('Amount exceeds your available balance')
      return
    }
    if (!verifiedName) {
      setError('Please verify the account first')
      return
    }
    if (source === 'credits' && creditsBalance < MIN_WITHDRAWAL_CREDITS) {
      setError(`You need at least ${MIN_WITHDRAWAL_CREDITS} credits to withdraw`)
      return
    }

    setLoading(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fincra-payout', {
        body: {
          userId: user.id,
          source: source,
          amount: numAmount,
          currency: source === 'wallet' ? (profile?.wallet_currency || 'NGN') : 'NGN',
          accountNumber,
          bankCode,
          accountName: verifiedName,
          email: user.email,
        },
      })

      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)

      setSuccess(true)
      refreshProfile()
      setTimeout(() => onClose(), 2500)

    } catch (e) {
      console.error('Withdraw error:', e)
      setError(e.message || 'Withdrawal failed. Try again.')
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px',
    borderRadius: '10px', border: '1.5px solid #E2E0FF',
    fontSize: '14px', fontFamily: 'inherit',
    color: '#14123A', boxSizing: 'border-box'
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
        maxHeight: '88vh', overflowY: 'auto',
        padding: '20px', paddingBottom: '32px'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '0 auto 20px'
        }} />

        {success ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#00C48C', marginBottom: '6px' }}>
              Withdrawal Initiated
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
              Your money is on its way. You'll be notified once it lands.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
              Withdraw Funds
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '20px' }}>
              Send money to your bank account
            </div>

            {/* Source selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              {[
                { key: 'wallet', label: 'Wallet', balance: `${profile?.wallet_currency || 'NGN'} ${walletBalance.toLocaleString()}` },
                { key: 'credits', label: 'Prima Credits', balance: `$${creditsAsDollars.toFixed(2)}` },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => setSource(s.key)}
                  style={{
                    flex: 1, padding: '12px',
                    background: source === s.key ? '#EEE9FF' : '#F5F4FF',
                    border: `1.5px solid ${source === s.key ? '#6C47FF' : '#E2E0FF'}`,
                    borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: source === s.key ? '#6C47FF' : '#8B8FAF' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#14123A', marginTop: '2px' }}>
                    {s.balance}
                  </div>
                </button>
              ))}
            </div>

            {/* Bank selector */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px' }}>
                Bank
              </label>
              <select
                value={bankCode}
                onChange={(e) => { setBankCode(e.target.value); setVerifiedName('') }}
                style={inputStyle}>
                <option value="">Select your bank</option>
                {banks.map((b, i) => (
                  <option key={i} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Account number */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px' }}>
                Account Number
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={accountNumber}
                  onChange={(e) => { setAccountNumber(e.target.value); setVerifiedName('') }}
                  placeholder="0123456789"
                  maxLength={10}
                  style={inputStyle}
                />
                <button
                  onClick={verifyAccount}
                  disabled={verifying}
                  style={{
                    padding: '0 16px', background: '#6C47FF', color: '#fff',
                    border: 'none', borderRadius: '10px', fontSize: '12px',
                    fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                    whiteSpace: 'nowrap'
                  }}>
                  {verifying ? '...' : 'Verify'}
                </button>
              </div>
            </div>

            {verifiedName && (
              <div style={{
                background: '#DFFDF4', border: '1.5px solid #7EECD2',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '13px', color: '#00A878', fontWeight: '700',
                marginBottom: '14px'
              }}>✓ {verifiedName}</div>
            )}

            {verifyError && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: '#FF3366', marginBottom: '14px'
              }}>{verifyError}</div>
            )}

            {/* Amount */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px' }}>
                Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                style={{ ...inputStyle, fontSize: '20px', fontWeight: '700' }}
              />
            </div>

            {error && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: '#FF3366', fontWeight: '600', marginBottom: '14px'
              }}>{error}</div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={loading || !verifiedName}
              style={{
                width: '100%',
                background: (loading || !verifiedName) ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                cursor: (loading || !verifiedName) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit'
              }}>
              {loading ? 'Processing...' : 'Withdraw →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}