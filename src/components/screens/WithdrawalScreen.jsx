import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useCredits } from '../../context/CreditsContext'
import { useAuth } from '../../context/AuthContext'
import { CREDITS_PER_DOLLAR, MIN_WITHDRAWAL_CREDITS } from '../../utils/payments'
import { requestFincraPayout, listFincraBanks, verifyFincraAccount } from '../../utils/fincra'

const MIN_CREDITS = MIN_WITHDRAWAL_CREDITS

export default function WithdrawalScreen() {
  const { credits, fetchCredits } = useCredits()
  const { user, profile } = useAuth()

  const [banks, setBanks] = useState([])
  const [bankCode, setBankCode] = useState('')
  const [bankSearch, setBankSearch] = useState('')
  const [showBankList, setShowBankList] = useState(false)
  const [accountNumber, setAccountNumber] = useState('')
  const [verifiedName, setVerifiedName] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const balance = credits?.balance || 0
  const dollarValue = balance / CREDITS_PER_DOLLAR
  const creditsToWithdraw = parseInt(amount) || 0
  const dollarPayout = creditsToWithdraw / CREDITS_PER_DOLLAR

  useEffect(() => {
    loadBanks()
  }, [])

  const CURRENCY_TO_COUNTRY = {
    NGN: 'NG', GHS: 'GH', KES: 'KE', ZAR: 'ZA',
    USD: 'US', EUR: 'DE', GBP: 'GB'
  }

  const loadBanks = async () => {
    try {
      const country = CURRENCY_TO_COUNTRY[profile?.wallet_currency || 'USD'] || 'NG'
      const data = await listFincraBanks(supabase, country)
      const list = Array.isArray(data?.data) ? data.data : (data?.data?.banks || data?.banks || [])
      setBanks(list)
    } catch (e) {
      console.error('Load banks error:', e)
    }
  }

  const verifyAccount = async () => {
    setError('')
    setVerifiedName('')
    if (!accountNumber || accountNumber.length < 4 || !bankCode) {
      setError('Enter a valid account number and select a bank')
      return
    }
    setVerifying(true)
    try {
      const data = await verifyFincraAccount(supabase, accountNumber, bankCode)
      const accountData = data?.data
      if (!accountData) {
        setError('Could not find this account. Check the details and try again.')
      } else {
        setVerifiedName(accountData.accountName || accountData.account_name || 'Verified')
      }
    } catch (e) {
      setError(e.message || 'Could not verify account')
    }
    setVerifying(false)
  }

  const labelStyle = {
    fontSize: '11px', fontWeight: '700',
    color: '#8B8FAF', textTransform: 'uppercase',
    letterSpacing: '0.8px', display: 'block', marginBottom: '6px'
  }

  const inputStyle = {
    width: '100%', background: '#F5F4FF',
    border: '1.5px solid #E2E0FF', borderRadius: '10px',
    padding: '11px 14px', fontSize: '13px',
    color: '#14123A', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box'
  }

  const handleSubmit = async () => {
    setError('')
    if (creditsToWithdraw < MIN_CREDITS) {
      return setError(`Minimum withdrawal is ${MIN_CREDITS} credits ($${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}).`)
    }
    if (creditsToWithdraw > balance) return setError('Insufficient credits balance.')
    if (!bankCode || !accountNumber) return setError('Select your bank and enter your account number.')
    if (!verifiedName) return setError('Please verify your account before withdrawing.')

    setSubmitting(true)
    try {
      // Deduct credits first (pessimistic pattern - matches wallet payout function)
      const { error: spendErr } = await supabase.rpc('spend_credits', {
        p_user_id: user.id,
        p_amount: creditsToWithdraw,
        p_type: 'withdrawal',
        p_description: `Withdrawal to ${verifiedName} — $${dollarPayout.toFixed(2)}`
      })
      if (spendErr) throw spendErr

      try {
        await requestFincraPayout(supabase, {
          userId: user.id,
          source: 'credits',
          amount: dollarPayout,
          currency: 'NGN',
          accountNumber,
          bankCode,
          accountName: verifiedName,
          email: user.email,
        })
      } catch (payoutErr) {
        // Refund credits since the payout call itself failed to initiate
        await supabase.rpc('add_credits', {
          p_user_id: user.id,
          p_amount: creditsToWithdraw,
          p_type: 'withdrawal_refund',
          p_description: 'Refund - withdrawal failed to initiate'
        })
        throw payoutErr
      }

      await supabase.from('notifications').insert({
        user_id: user.id,
        title: '💸 Withdrawal Processing',
        message: `Your withdrawal of ${creditsToWithdraw} credits ($${dollarPayout.toFixed(2)}) is being sent to your bank account.`,
        type: 'general'
      })

      await fetchCredits()
      setDone(true)
    } catch (e) {
      setError(e.message || 'Withdrawal failed. Please try again.')
    }
    setSubmitting(false)
  }

  if (done) {
    return (
      <div style={{
        padding: '24px 20px 100px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
        <div style={{
          fontSize: '22px', fontWeight: '800',
          color: '#14123A', marginBottom: '8px'
        }}>Withdrawal Sent!</div>
        <div style={{
          fontSize: '14px', color: '#8B8FAF',
          lineHeight: '1.6', marginBottom: '24px',
          maxWidth: '280px', margin: '0 auto 24px'
        }}>
          Your {creditsToWithdraw} credits (${dollarPayout.toFixed(2)}) is on its way to {verifiedName}. You'll get a notification once it lands.
        </div>
        <button
          onClick={() => {
            setDone(false); setAmount(''); setBankCode(''); setBankSearch('')
            setAccountNumber(''); setVerifiedName('')
          }}
          style={{
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '14px',
            padding: '14px 32px', fontSize: '14px',
            fontWeight: '700', color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit'
          }}>
          Make Another Withdrawal
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        fontSize: '22px', fontWeight: '800',
        color: '#14123A', marginBottom: '4px'
      }}>Withdraw Credits</div>
      <div style={{
        fontSize: '13px', color: '#8B8FAF', marginBottom: '24px'
      }}>Convert Prima Credits to cash</div>

      {/* Balance Card */}
      <div style={{
        background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
        borderRadius: '20px', padding: '20px',
        color: '#fff', marginBottom: '24px', textAlign: 'center'
      }}>
        <div style={{
          fontSize: '11px', opacity: 0.8,
          letterSpacing: '1.5px', textTransform: 'uppercase',
          marginBottom: '6px'
        }}>Available Balance</div>
        <div style={{
          fontSize: '48px', fontWeight: '800',
          letterSpacing: '-2px', marginBottom: '4px'
        }}>{balance.toFixed(0)}</div>
        <div style={{ fontSize: '13px', opacity: 0.8 }}>
          Prima Credits ≈ ${dollarValue.toFixed(2)} USD
        </div>
      </div>

      {/* Rate Info */}
      <div style={{
        background: '#F5F4FF', border: '1.5px solid #E2E0FF',
        borderRadius: '14px', padding: '14px',
        marginBottom: '20px', display: 'flex',
        gap: '10px', alignItems: 'center'
      }}>
        <span style={{ fontSize: '20px', flexShrink: 0 }}>ℹ️</span>
        <div style={{ fontSize: '12px', color: '#6C47FF', lineHeight: '1.6' }}>
          <strong>{CREDITS_PER_DOLLAR} Credits = $1 USD.</strong> Minimum withdrawal is {MIN_CREDITS} credits (${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}). Sent automatically via Fincra.
        </div>
      </div>

      {/* Bank selection */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Bank</label>
        <div
          onClick={() => setShowBankList(true)}
          style={{
            ...inputStyle, display: 'flex', alignItems: 'center',
            gap: '8px', cursor: 'pointer',
            border: bankCode ? '1.5px solid #6C47FF' : '1.5px solid #E2E0FF',
          }}
        >
          <span style={{ fontSize: '14px', flexShrink: 0 }}>🏦</span>
          <span style={{ flex: 1, fontSize: '13px', color: bankCode ? '#14123A' : '#8B8FAF' }}>
            {banks.find(b => b.code === bankCode)?.name || 'Search and select your bank'}
          </span>
          {bankCode
            ? <span style={{ fontSize: '11px', color: '#6C47FF', fontWeight: '700', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); setBankCode(''); setBankSearch(''); setVerifiedName('') }}>✕</span>
            : <span style={{ fontSize: '16px', color: '#8B8FAF' }}>›</span>
          }
        </div>
      </div>

      {/* Bank picker modal */}
      {showBankList && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(20,18,58,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }} onClick={() => { setShowBankList(false); setBankSearch('') }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: '540px',
            height: '75vh', display: 'flex', flexDirection: 'column',
            padding: '0 0 20px',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
              <div style={{ width: '40px', height: '4px', background: '#E2E0FF', borderRadius: '2px' }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: '800', color: '#14123A', marginBottom: '14px' }}>
              Select Bank
            </div>

            {/* Search */}
            <div style={{ padding: '0 16px 12px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '12px', padding: '10px 14px',
              }}>
                <span style={{ fontSize: '16px' }}>🔍</span>
                <input
                  autoFocus
                  value={bankSearch}
                  onChange={e => setBankSearch(e.target.value)}
                  placeholder="Type bank name..."
                  style={{
                    flex: 1, border: 'none', outline: 'none',
                    background: 'transparent', fontSize: '14px',
                    color: '#14123A', fontFamily: 'inherit',
                  }}
                />
                {bankSearch && (
                  <span onClick={() => setBankSearch('')}
                    style={{ fontSize: '12px', color: '#8B8FAF', cursor: 'pointer', fontWeight: '700' }}>✕</span>
                )}
              </div>
            </div>

            {/* Bank list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {banks
                .filter(b => b.name?.toLowerCase().includes(bankSearch.toLowerCase()))
                .map((b, i) => (
                  <div
                    key={i}
                    onClick={() => { setBankCode(b.code); setBankSearch(''); setShowBankList(false); setVerifiedName('') }}
                    style={{
                      padding: '13px 20px', fontSize: '14px',
                      color: b.code === bankCode ? '#6C47FF' : '#14123A',
                      background: b.code === bankCode ? '#F5F4FF' : 'transparent',
                      fontWeight: b.code === bankCode ? '700' : '500',
                      cursor: 'pointer',
                      borderBottom: '1px solid #F5F4FF',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>{b.name}</span>
                    {b.code === bankCode && <span style={{ fontSize: '16px', color: '#6C47FF' }}>✓</span>}
                  </div>
                ))
              }
              {banks.filter(b => b.name?.toLowerCase().includes(bankSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8B8FAF', fontSize: '13px' }}>
                  No bank found for "{bankSearch}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '10px' }}>
        <label style={labelStyle}>Account Number</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            style={inputStyle}
            placeholder="10-digit account number"
            maxLength={10}
            value={accountNumber}
            onChange={e => { setAccountNumber(e.target.value); setVerifiedName('') }}
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
          marginBottom: '20px'
        }}>✓ {verifiedName}</div>
      )}

      {/* Amount Input */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#14123A', marginBottom: '8px'
        }}>Credits to Withdraw</div>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={`Min ${MIN_CREDITS} credits`}
          min={MIN_CREDITS}
          max={balance}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#F5F4FF', border: '1.5px solid #E2E0FF',
            borderRadius: '12px', padding: '14px 16px',
            fontSize: '16px', fontWeight: '700',
            color: '#14123A', fontFamily: 'inherit',
            outline: 'none'
          }}
        />
        {creditsToWithdraw > 0 && (
          <div style={{
            fontSize: '12px', color: '#00C48C',
            fontWeight: '600', marginTop: '6px'
          }}>
            ≈ ${dollarPayout.toFixed(2)} USD payout
          </div>
        )}
      </div>

      {error && (
        <div style={{
          background: '#FFE8EE', border: '1.5px solid #FF99B3',
          borderRadius: '12px', padding: '12px 14px',
          fontSize: '13px', color: '#FF3366',
          marginBottom: '16px', fontWeight: '600'
        }}>{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !verifiedName}
        style={{
          width: '100%',
          background: (submitting || !verifiedName)
            ? '#B8A5FF'
            : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
          border: 'none', borderRadius: '14px',
          padding: '16px', fontSize: '15px',
          fontWeight: '700', color: '#fff',
          cursor: (submitting || !verifiedName) ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: (submitting || !verifiedName) ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
          transition: 'all 0.2s'
        }}>
        {submitting ? '⏳ Processing...' : '💸 Withdraw Now'}
      </button>

      <div style={{
        fontSize: '11px', color: '#A09DC8',
        textAlign: 'center', marginTop: '10px',
        lineHeight: '1.6', background: '#F5F4FF',
        borderRadius: '10px', padding: '10px 14px'
      }}>
        💸 Credits deducted immediately on request.<br/>
        💳 Sent automatically via Fincra — no manual review.<br/>
        📧 You'll get a notification when payment lands.
      </div>
    </div>
  )
}