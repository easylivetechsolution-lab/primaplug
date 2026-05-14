import { useState } from 'react'
import { supabase } from '../../supabase'
import { useCredits } from '../../context/CreditsContext'
import { useAuth } from '../../context/AuthContext'

const METHODS = [
  { key: 'bank', label: 'Bank Transfer', icon: '🏦', desc: 'Nigeria local bank account' },
  { key: 'opay', label: 'OPay', icon: '📱', desc: 'OPay wallet' },
  { key: 'palmpay', label: 'PalmPay', icon: '🌴', desc: 'PalmPay wallet' },
  { key: 'flutterwave', label: 'Flutterwave', icon: '🦋', desc: 'Flutterwave payout' },
]

const CREDITS_PER_DOLLAR = 50
const MIN_CREDITS = 500

export default function WithdrawalScreen() {
  const { credits, fetchCredits } = useCredits()
  const { user } = useAuth()
  const [method, setMethod] = useState(null)
  const [amount, setAmount] = useState('')
  const [accountDetails, setAccountDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const balance = credits?.balance || 0
  const dollarValue = balance / CREDITS_PER_DOLLAR
  const creditsToWithdraw = parseInt(amount) || 0
  const dollarPayout = creditsToWithdraw / CREDITS_PER_DOLLAR

  const handleSubmit = async () => {
    setError('')
    if (!method) return setError('Please select a withdrawal method.')
    if (creditsToWithdraw < MIN_CREDITS) return setError(`Minimum withdrawal is ${MIN_CREDITS} credits ($${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}).`)
    if (creditsToWithdraw > balance) return setError('Insufficient credits balance.')
    if (!accountDetails.trim()) return setError('Please enter your account details.')

    setSubmitting(true)
    try {
      const { error: spendErr } = await supabase.rpc('spend_credits', {
        p_user_id: user.id,
        p_amount: creditsToWithdraw,
        p_type: 'withdrawal',
        p_description: `Withdrawal via ${method} — $${dollarPayout.toFixed(2)}`
      })
      if (spendErr) throw spendErr

      await supabase.from('withdrawals').insert({
        user_id: user.id,
        credits_amount: creditsToWithdraw,
        dollar_amount: dollarPayout,
        method,
        account_details: accountDetails.trim(),
        status: 'pending'
      })

      await supabase.from('notifications').insert({
        user_id: user.id,
        title: '💸 Withdrawal Requested',
        message: `Your withdrawal of ${creditsToWithdraw} credits ($${dollarPayout.toFixed(2)}) via ${method} is being processed.`,
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
        }}>Withdrawal Requested!</div>
        <div style={{
          fontSize: '14px', color: '#8B8FAF',
          lineHeight: '1.6', marginBottom: '24px',
          maxWidth: '280px', margin: '0 auto 24px'
        }}>
          Your {creditsToWithdraw} credits (${dollarPayout.toFixed(2)}) payout via {METHODS.find(m => m.key === method)?.label} is being processed. Allow 1–3 business days.
        </div>
        <button
          onClick={() => { setDone(false); setAmount(''); setAccountDetails(''); setMethod(null) }}
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
          <strong>50 Credits = $1 USD.</strong> Minimum withdrawal is {MIN_CREDITS} credits (${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}). Processing takes 1–3 business days.
        </div>
      </div>

      {/* Method Selection */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#14123A', marginBottom: '10px'
        }}>Withdrawal Method</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {METHODS.map(m => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              style={{
                background: method === m.key ? '#EEE9FF' : '#fff',
                border: `1.5px solid ${method === m.key ? '#6C47FF' : '#E2E0FF'}`,
                borderRadius: '14px', padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: '12px',
                cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', transition: 'all 0.15s'
              }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px', fontWeight: '700',
                  color: method === m.key ? '#6C47FF' : '#14123A'
                }}>{m.label}</div>
                <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{m.desc}</div>
              </div>
              {method === m.key && (
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: '#6C47FF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', color: '#fff', flexShrink: 0
                }}>✓</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Amount Input */}
      <div style={{ marginBottom: '16px' }}>
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

      {/* Account Details */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#14123A', marginBottom: '8px'
        }}>Account Details</div>
        <textarea
          value={accountDetails}
          onChange={e => setAccountDetails(e.target.value)}
          placeholder={
            method === 'bank'
              ? 'Bank name, account number, account name'
              : method === 'opay' || method === 'palmpay'
                ? 'Phone number registered on the wallet'
                : 'Your Flutterwave account email or ID'
          }
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#F5F4FF', border: '1.5px solid #E2E0FF',
            borderRadius: '12px', padding: '14px 16px',
            fontSize: '13px', color: '#14123A',
            fontFamily: 'inherit', resize: 'none',
            outline: 'none', lineHeight: '1.5'
          }}
        />
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
        disabled={submitting}
        style={{
          width: '100%',
          background: submitting
            ? '#B8A5FF'
            : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
          border: 'none', borderRadius: '14px',
          padding: '16px', fontSize: '15px',
          fontWeight: '700', color: '#fff',
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: submitting ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
          transition: 'all 0.2s'
        }}>
        {submitting ? '⏳ Processing...' : '💸 Request Withdrawal'}
      </button>
    </div>
  )
}
