import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { getCurrency } from '../../data/currencies'
import { startFincraWalletFunding, requestFincraPayout, listFincraBanks, verifyFincraAccount, verifyFincraPayment } from '../../utils/fincra'

const SUPPORTED_WALLET_CURRENCIES = ['NGN', 'GHS', 'KES', 'UGX', 'ZAR', 'USD']

const FUND_TYPES = ['fund_in']
const WITHDRAW_TYPES = ['withdrawal']

const timeAgo = (date) => {
  if (!date) return ''
  const s = Math.floor((new Date() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_STYLE = {
  completed: { color: '#00A878', bg: '#DFFDF4', label: 'Completed' },
  pending: { color: '#FF6B2B', bg: '#FFF0E8', label: 'Pending' },
  failed: { color: '#FF3366', bg: '#FFE8EE', label: 'Failed' },
}

export default function WalletScreen() {
  const { user, profile, refreshProfile } = useAuth()

  const [amount, setAmount] = useState('')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyTab, setHistoryTab] = useState('fund')

  const [selectedCurrency, setSelectedCurrency] = useState(profile?.wallet_currency || 'NGN')
  const currencyLocked = Number(profile?.wallet_balance || 0) > 0
  const currencyCode = currencyLocked ? (profile?.wallet_currency || 'NGN') : selectedCurrency
  const currency = getCurrency(currencyCode)
  const walletBalance = Number(profile?.wallet_balance || 0)
  const heldBalance = Number(profile?.held_balance || 0)

  const [showFund, setShowFund] = useState(false)
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
      .limit(60)

    setTransactions(data || [])
  }, [user])

  const autoVerifyPending = useCallback(async () => {
  if (!user) return
  const { data: pendingTxns } = await supabase
    .from('wallet_transactions')
    .select('fincra_reference')
    .eq('user_id', user.id)
    .eq('type', 'fund_in')
    .eq('status', 'pending')
    .not('fincra_reference', 'is', null)

  if (!pendingTxns || pendingTxns.length === 0) return

  for (const txn of pendingTxns) {
    try {
      await verifyFincraPayment(supabase, txn.fincra_reference)
    } catch (e) {
      // Silently skip - this one may genuinely still be pending on Fincra's side
    }
  }
  fetchTransactions()
  refreshProfile()
}, [user, fetchTransactions, refreshProfile])

  useEffect(() => {
  if (!user) return
  const timer = setTimeout(() => {
    fetchTransactions()
    autoVerifyPending()
  }, 0)

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
}, [fetchTransactions, autoVerifyPending, refreshProfile, user])

  useEffect(() => {
  const handleReturn = async (e) => {
    const reference = e.detail?.reference
    if (!reference) return
    try {
      await verifyFincraPayment(supabase, reference)
      refreshProfile()
      fetchTransactions()
    } catch (err) {
      console.error('Verify on return error:', err)
    }
  }

  window.addEventListener('walletPaymentReturn', handleReturn)
  return () => window.removeEventListener('walletPaymentReturn', handleReturn)
}, [user])

  const fundHistory = transactions.filter(tx => FUND_TYPES.includes(tx.type))
  const withdrawHistory = transactions.filter(tx => WITHDRAW_TYPES.includes(tx.type))
  const activeHistory = historyTab === 'fund' ? fundHistory : withdrawHistory

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
const list = Array.isArray(data?.data) ? data.data : (data?.data?.banks || data?.banks || [])
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
      setHistoryTab('withdraw')
    } catch (e) {
      setWithdrawError(e.message || 'Withdrawal failed')
    }
    setWithdrawing(false)
  }

  const inputStyle = {
    width: '100%',
    background: '#F5F4FF',
    border: '1.5px solid #E2E0FF',
    borderRadius: '12px',
    padding: '13px 14px',
    fontSize: '14px',
    color: '#14123A',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box'
  }

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      maxWidth: '680px'
    }}>

      {/* HEADER */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
          Wallet
        </div>
        <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
          Fund gigs, hold escrow, and receive worker payouts
        </div>
      </div>

      {/* BALANCE HERO */}
      <div style={{
        background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
        borderRadius: '24px',
        padding: '24px',
        color: '#fff',
        marginBottom: '16px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          fontSize: '10px', opacity: 0.8, textTransform: 'uppercase',
          letterSpacing: '1.5px', marginBottom: '8px', fontWeight: '700'
        }}>
          Available Balance
        </div>
        <div style={{
          fontSize: '44px', fontWeight: '800',
          letterSpacing: '-1.5px', marginBottom: '4px', lineHeight: 1
        }}>
          {currency.symbol}{walletBalance.toLocaleString()}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.75, marginBottom: '18px' }}>
          {currencyCode} wallet
        </div>

        {heldBalance > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '12px',
            padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '16px'
          }}>
            <span style={{ fontSize: '12px', opacity: 0.85 }}>🔒 Held in escrow</span>
            <strong style={{ fontSize: '13px' }}>{currency.symbol}{heldBalance.toLocaleString()}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowFund(true)}
            style={{
              flex: 1,
              background: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '13px',
              color: '#6C47FF',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
            💰 Fund Wallet
          </button>
          <button
            onClick={openWithdraw}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.18)',
              border: '1.5px solid rgba(255,255,255,0.4)',
              borderRadius: '12px',
              padding: '13px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
            💸 Withdraw
          </button>
        </div>
      </div>

      {/* HISTORY TABS */}
      <div style={{
        display: 'flex', gap: '4px',
        background: '#fff', borderRadius: '14px',
        padding: '4px', border: '1.5px solid #E2E0FF',
        marginBottom: '12px'
      }}>
        {[
          { key: 'fund', label: 'Funding History', count: fundHistory.length },
          { key: 'withdraw', label: 'Withdrawal History', count: withdrawHistory.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setHistoryTab(tab.key)}
            style={{
              flex: 1,
              background: historyTab === tab.key ? '#6C47FF' : 'transparent',
              border: 'none', borderRadius: '10px',
              padding: '10px 6px', fontSize: '12px',
              fontWeight: historyTab === tab.key ? '700' : '500',
              color: historyTab === tab.key ? '#fff' : '#8B8FAF',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s'
            }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: '6px',
                background: historyTab === tab.key ? 'rgba(255,255,255,0.25)' : '#EEE9FF',
                color: historyTab === tab.key ? '#fff' : '#6C47FF',
                borderRadius: '10px', padding: '1px 7px',
                fontSize: '10px', fontWeight: '800'
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* HISTORY LIST */}
      {activeHistory.length === 0 ? (
        <div style={{
          background: '#fff', border: '1.5px solid #E2E0FF',
          borderRadius: '18px', padding: '36px 20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>
            {historyTab === 'fund' ? '💰' : '💸'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#14123A', marginBottom: '4px' }}>
            {historyTab === 'fund' ? 'No funding yet' : 'No withdrawals yet'}
          </div>
          <div style={{ fontSize: '12px', color: '#A09DC8' }}>
            {historyTab === 'fund'
              ? 'Money you add to your wallet will show up here'
              : 'Money you send to your bank will show up here'}
          </div>
        </div>
      ) : activeHistory.map(tx => {
        const st = STATUS_STYLE[tx.status] || STATUS_STYLE.pending
        const isOutflow = historyTab === 'withdraw'
        return (
          <div key={tx.id} style={{
            background: '#fff', border: '1.5px solid #E2E0FF',
            borderRadius: '16px', padding: '14px 16px',
            marginBottom: '10px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center', gap: '12px'
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '11px',
                background: isOutflow ? '#FFF0E8' : '#DFFDF4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', flexShrink: 0
              }}>{isOutflow ? '↑' : '↓'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: '13px', fontWeight: '700', color: '#14123A',
                  marginBottom: '3px', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {tx.description || tx.type.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#A09DC8' }}>{timeAgo(tx.created_at)}</span>
                  <span style={{
                    fontSize: '9px', fontWeight: '800',
                    color: st.color, background: st.bg,
                    borderRadius: '6px', padding: '2px 7px',
                    textTransform: 'uppercase', letterSpacing: '0.4px'
                  }}>{st.label}</span>
                </div>
              </div>
            </div>
            <div style={{
              fontSize: '14px', fontWeight: '800', flexShrink: 0,
              color: isOutflow ? '#FF6B2B' : '#00A878'
            }}>
              {isOutflow ? '-' : '+'}{getCurrency(tx.currency || currencyCode).symbol}{Number(tx.amount || 0).toLocaleString()}
            </div>
          </div>
        )
      })}

      {/* FUND MODAL */}
      {showFund && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }} onClick={() => setShowFund(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: '540px', padding: '20px', paddingBottom: '32px'
          }}>
            <div style={{
              width: '40px', height: '4px', background: '#E2E0FF',
              borderRadius: '2px', margin: '0 auto 18px'
            }} />
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
              Fund Your Wallet
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '18px' }}>
              Add money to pay workers instantly
            </div>

            {!currencyLocked && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Currency
                </label>
                <select
                  value={selectedCurrency}
                  onChange={e => setSelectedCurrency(e.target.value)}
                  style={inputStyle}>
                  {SUPPORTED_WALLET_CURRENCIES.map(c => (
                    <option key={c} value={c}>{getCurrency(c).symbol} {c} — {getCurrency(c).name}</option>
                  ))}
                </select>
              </div>
            )}
            {currencyLocked && (
              <div style={{
                fontSize: '12px', color: '#6C47FF', background: '#EEE9FF',
                borderRadius: '10px', padding: '10px 12px', marginBottom: '12px'
              }}>
                Wallet locked to {currencyCode} since you already have a balance
              </div>
            )}

            <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Amount
            </label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ ...inputStyle, fontSize: '20px', fontWeight: '700', marginBottom: '14px' }}
            />

            {error && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: '#FF3366', fontWeight: '600', marginBottom: '14px'
              }}>{error}</div>
            )}

            <button
              onClick={fundWallet}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
              }}>
              {loading ? 'Redirecting to Fincra...' : 'Continue to Payment →'}
            </button>
            <div style={{ fontSize: '11px', color: '#A09DC8', textAlign: 'center', marginTop: '12px' }}>
              🔒 Secured by Fincra
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW MODAL */}
      {showWithdraw && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }} onClick={() => setShowWithdraw(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: '540px', padding: '20px', paddingBottom: '32px'
          }}>
            <div style={{
              width: '40px', height: '4px', background: '#E2E0FF',
              borderRadius: '2px', margin: '0 auto 18px'
            }} />
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
              Withdraw from Wallet
            </div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '18px' }}>
              Send money straight to your bank — no minimum
            </div>

            <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Bank
            </label>
            <select
              value={bankCode}
              onChange={e => { setBankCode(e.target.value); setVerifiedName('') }}
              style={{ ...inputStyle, marginBottom: '10px' }}>
              <option value="">Select your bank</option>
              {banks.map((b, i) => <option key={i} value={b.code}>{b.name}</option>)}
            </select>

            <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Account Number
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                value={accountNumber}
                onChange={e => { setAccountNumber(e.target.value); setVerifiedName('') }}
                placeholder="0123456789"
                maxLength={10}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={verifyWithdrawAccount}
                disabled={verifying}
                style={{
                  padding: '0 18px', background: '#6C47FF', color: '#fff',
                  border: 'none', borderRadius: '12px', fontSize: '13px',
                  fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
                }}>
                {verifying ? '...' : 'Verify'}
              </button>
            </div>

            {verifiedName && (
              <div style={{
                background: '#DFFDF4', border: '1.5px solid #7EECD2',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '13px', color: '#00A878', fontWeight: '700', marginBottom: '14px'
              }}>✓ {verifiedName}</div>
            )}

            <label style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Amount
            </label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder={`Amount in ${currencyCode}`}
              style={{ ...inputStyle, fontSize: '20px', fontWeight: '700', marginBottom: '14px' }}
            />

            {withdrawError && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: '#FF3366', fontWeight: '600', marginBottom: '14px'
              }}>{withdrawError}</div>
            )}

            <button
              onClick={submitWithdraw}
              disabled={withdrawing || !verifiedName}
              style={{
                width: '100%', padding: '14px',
                background: (withdrawing || !verifiedName) ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', color: '#fff', fontWeight: '700',
                fontSize: '14px', cursor: (withdrawing || !verifiedName) ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: (withdrawing || !verifiedName) ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
              }}>
              {withdrawing ? 'Processing...' : 'Withdraw →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}