import { useState } from 'react'
import { supabase } from '../../supabase'
import { useCredits } from '../../context/CreditsContext'
import { useAuth } from '../../context/AuthContext'

const PAYMENT_METHODS = [
  {
    key: 'international',
    label: 'International',
    icon: '🌍',
    desc: 'USD, GBP, EUR bank',
    fields: ['bank_name', 'account_number', 'account_name', 'swift_code'],
    currency: 'USD'
  },
  {
    key: 'nigerian_bank',
    label: 'Bank Details',
    icon: '🏦',
    desc: 'All Nigerian banks',
    fields: ['bank_name', 'account_number', 'account_name'],
    currency: 'NGN'
  },
  {
    key: 'mobile_money',
    label: 'Mobile Money',
    icon: '📱',
    desc: 'OPay, PalmPay, Kuda',
    fields: ['mobile_number', 'account_name'],
    currency: 'NGN'
  },
]

const CREDITS_PER_DOLLAR = 50
const MIN_CREDITS = 500

export default function WithdrawalScreen() {
  const { credits, fetchCredits } = useCredits()
  const { user } = useAuth()
  const [method, setMethod] = useState(null)
  const [amount, setAmount] = useState('')
  const [form, setForm] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const balance = credits?.balance || 0
  const dollarValue = balance / CREDITS_PER_DOLLAR
  const creditsToWithdraw = parseInt(amount) || 0
  const dollarPayout = creditsToWithdraw / CREDITS_PER_DOLLAR
  const selectedMethod = PAYMENT_METHODS.find(m => m.key === method)

  const updateForm = (key, val) => setForm(f => ({ ...f, [key]: val }))

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
    if (!method) return setError('Please select a withdrawal method.')
    if (creditsToWithdraw < MIN_CREDITS) return setError(`Minimum withdrawal is ${MIN_CREDITS} credits ($${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}).`)
    if (creditsToWithdraw > balance) return setError('Insufficient credits balance.')
    if (!form.account_name?.trim()) return setError('Please enter your account details.')

    const accountDetails = Object.entries(form)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')

    setSubmitting(true)
    try {
      const { error: spendErr } = await supabase.rpc('spend_credits', {
        p_user_id: user.id,
        p_amount: creditsToWithdraw,
        p_type: 'withdrawal',
        p_description: `Withdrawal via ${selectedMethod?.label} — $${dollarPayout.toFixed(2)}`
      })
      if (spendErr) throw spendErr

      await supabase.from('withdrawals').insert({
        user_id: user.id,
        credits_amount: creditsToWithdraw,
        dollar_amount: dollarPayout,
        method,
        account_details: accountDetails,
        status: 'pending'
      })

      await supabase.from('notifications').insert({
        user_id: user.id,
        title: '💸 Withdrawal Requested',
        message: `Your withdrawal of ${creditsToWithdraw} credits ($${dollarPayout.toFixed(2)}) via ${selectedMethod?.label} is being processed.`,
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
          Your {creditsToWithdraw} credits (${dollarPayout.toFixed(2)}) payout via {selectedMethod?.label} is being processed. Allow 1–3 business days.
        </div>
        <button
          onClick={() => { setDone(false); setAmount(''); setForm({}); setMethod(null) }}
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

      {/* Payment Method */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Where should we send it?</label>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {PAYMENT_METHODS.map(m => (
            <div
              key={m.key}
              onClick={() => { setMethod(m.key); setForm({}) }}
              style={{
                background: method === m.key ? '#EEE9FF' : '#fff',
                border: `1.5px solid ${method === m.key ? '#6C47FF' : '#E2E0FF'}`,
                borderRadius: '14px', padding: '14px 16px',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: method === m.key ? '#6C47FF' : '#F5F4FF',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px',
                flexShrink: 0, transition: 'all 0.15s'
              }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px', fontWeight: '700',
                  color: method === m.key ? '#6C47FF' : '#14123A',
                  marginBottom: '2px'
                }}>{m.label}</div>
                <div style={{
                  fontSize: '11px',
                  color: method === m.key ? '#6C47FF' : '#A09DC8',
                  opacity: 0.8
                }}>{m.desc}</div>
              </div>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                border: `2px solid ${method === m.key ? '#6C47FF' : '#E2E0FF'}`,
                background: method === m.key ? '#6C47FF' : '#fff',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
                transition: 'all 0.15s'
              }}>
                {method === m.key && (
                  <div style={{
                    width: '8px', height: '8px',
                    borderRadius: '50%', background: '#fff'
                  }} />
                )}
              </div>
            </div>
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

      {/* Payment Details */}
      {method && (
        <div style={{
          background: '#F5F4FF', borderRadius: '14px',
          padding: '16px', marginBottom: '20px',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700',
            color: '#14123A',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            <span>{selectedMethod?.icon}</span>
            {selectedMethod?.label} Details
          </div>

          {/* Nigerian Bank */}
          {method === 'nigerian_bank' && (
            <>
              <div>
                <label style={labelStyle}>Bank Name</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="e.g. GTBank, First Bank, Access, Zenith..."
                  value={form.bank_name || ''}
                  onChange={e => updateForm('bank_name', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>Account Number</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="10-digit NUBAN account number"
                  maxLength={10}
                  value={form.account_number || ''}
                  onChange={e => updateForm('account_number', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>Account Name</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="Full name as it appears on account"
                  value={form.account_name || ''}
                  onChange={e => updateForm('account_name', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
            </>
          )}

          {/* Mobile Money */}
          {method === 'mobile_money' && (
            <>
              <div>
                <label style={labelStyle}>Mobile Number</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="e.g. 08012345678"
                  value={form.mobile_number || ''}
                  onChange={e => updateForm('mobile_number', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>Wallet Provider</label>
                <select
                  value={form.bank_name || ''}
                  onChange={e => updateForm('bank_name', e.target.value)}
                  style={{ ...inputStyle, background: '#fff', appearance: 'none' }}>
                  <option value="">Select provider</option>
                  <option value="OPay">OPay</option>
                  <option value="PalmPay">PalmPay</option>
                  <option value="Kuda">Kuda</option>
                  <option value="Carbon">Carbon</option>
                  <option value="Moniepoint">Moniepoint</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Account Name</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="Full name on wallet"
                  value={form.account_name || ''}
                  onChange={e => updateForm('account_name', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
            </>
          )}

          {/* International */}
          {method === 'international' && (
            <>
              <div>
                <label style={labelStyle}>Bank Name</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="Your bank name"
                  value={form.bank_name || ''}
                  onChange={e => updateForm('bank_name', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>Account / IBAN Number</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="Account or IBAN number"
                  value={form.account_number || ''}
                  onChange={e => updateForm('account_number', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>SWIFT / BIC Code</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="e.g. AAAABBCC123"
                  value={form.swift_code || ''}
                  onChange={e => updateForm('swift_code', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
              <div>
                <label style={labelStyle}>Account Name</label>
                <input
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="Full name on account"
                  value={form.account_name || ''}
                  onChange={e => updateForm('account_name', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>
            </>
          )}

        </div>
      )}

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

      <div style={{
        fontSize: '11px', color: '#A09DC8',
        textAlign: 'center', marginTop: '10px',
        lineHeight: '1.6', background: '#F5F4FF',
        borderRadius: '10px', padding: '10px 14px'
      }}>
        💸 Credits deducted immediately on request.<br/>
        💳 Payment sent via Flutterwave within 48 hours.<br/>
        📧 You'll get a notification when payment is sent.
      </div>
    </div>
  )
}
