import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { getCurrency, FINCRA_CURRENCIES } from '../../data/currencies'
import { startFincraWalletFunding, requestFincraPayout, listFincraBanks, verifyFincraAccount, verifyFincraPayment } from '../../utils/fincra'
import { parseTimestamp } from '../../utils/time'
import { showToast } from '../../utils/toast'

const FUND_TYPES = ['fund_in', 'escrow_release_worker', 'gig_referral_payout', 'withdrawal_refund']
const WITHDRAW_TYPES = ['withdrawal', 'escrow_lock']

const timeAgo = (date) => {
  if (!date) return ''
  const s = Math.floor((new Date() - parseTimestamp(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_STYLE = {
  completed: { color: 'var(--color-success)', bg: 'var(--color-success-soft)', label: 'Completed' },
  pending:   { color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', label: 'Pending' },
  failed:    { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', label: 'Failed' },
}

const reportIssueLink = (tx) => {
  const subject = `Wallet transaction issue — ${tx.id}`
  const body = [
    'Hello Prima Payments Support,',
    '',
    'I need help with this wallet transaction.',
    `Transaction ID: ${tx.id}`,
    `Provider reference: ${tx.fincra_reference || 'Not available'}`,
    `Type: ${tx.type}`,
    `Amount: ${tx.amount} ${tx.currency || ''}`,
    `Status: ${tx.status || 'Unknown'}`,
    `Date: ${parseTimestamp(tx.created_at).toLocaleString()}`,
    '',
    'What went wrong?',
  ].join('\n')
  return `mailto:payments@primaplug.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export default function WalletScreen() {
  const { user, profile, wallets, refreshProfile } = useAuth()

  const [transactions, setTransactions]   = useState([])
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedTx, setExpandedTx]       = useState(null)
  const [historyTab, setHistoryTab]       = useState('fund')
  const [showStatementPreview, setShowStatementPreview] = useState(false)

  // Which wallet the user is acting on (currency string)
  const [activeCurrency, setActiveCurrency] = useState(null)
  const activeWallet = wallets.find(w => w.currency === activeCurrency) || wallets[0] || null

  // Fund modal
  const [showFund, setShowFund]           = useState(false)
  const [fundCurrency, setFundCurrency]   = useState('NGN')
  const [amount, setAmount]               = useState('')
  const [fundLoading, setFundLoading]     = useState(false)
  const [fundError, setFundError]         = useState('')
  const [checkoutUrl, setCheckoutUrl]     = useState(null)

  // Withdraw modal
  const [showWithdraw, setShowWithdraw]   = useState(false)
  const [banks, setBanks]                 = useState([])
  const [bankCode, setBankCode]           = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [verifiedName, setVerifiedName]   = useState('')
  const [verifying, setVerifying]         = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing]     = useState(false)
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
    setHasMoreTransactions((data || []).length === 60)
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
      try { await verifyFincraPayment(supabase, txn.fincra_reference) } catch (_) {}
    }
    fetchTransactions()
    refreshProfile()
  }, [user, fetchTransactions, refreshProfile])

  useEffect(() => {
    if (!user) return
    fetchTransactions()
    autoVerifyPending()

    const pollInterval = setInterval(autoVerifyPending, 10000)

    const channel = supabase
      .channel('wallet-' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'wallet_transactions',
        filter: `user_id=eq.${user.id}`
      }, () => { fetchTransactions(); refreshProfile() })
      .subscribe()

    return () => { clearInterval(pollInterval); supabase.removeChannel(channel) }
  }, [fetchTransactions, autoVerifyPending, refreshProfile, user])

  useEffect(() => {
    let cancelled = false
    const handleReturn = async (e) => {
      const reference = e.detail?.reference
      if (!reference) return
      for (let attempt = 0; attempt < 6; attempt++) {
        if (cancelled) break
        try {
          const result = await verifyFincraPayment(supabase, reference)
          if (!cancelled) { refreshProfile(); fetchTransactions() }
          if (result?.status === 'completed') break
        } catch (err) {
          console.error('Verify on return attempt', attempt + 1, err)
        }
        if (attempt < 5 && !cancelled) {
          await new Promise(r => setTimeout(r, 5000))
        }
      }
      if (!cancelled) { refreshProfile(); fetchTransactions() }
    }
    window.addEventListener('walletPaymentReturn', handleReturn)
    return () => { cancelled = true; window.removeEventListener('walletPaymentReturn', handleReturn) }
  }, [user])

  useEffect(() => {
    const handleOpenWalletTransaction = async (event) => {
      const target = event.detail || {}
      const text = `${target.title || ''} ${target.message || ''}`.toLowerCase()
      const isWithdrawal = text.includes('withdrawal')
      setHistoryTab(isWithdrawal ? 'withdraw' : 'fund')

      let transaction = null
      if (target.id) {
        const { data } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('id', target.id)
          .maybeSingle()
        transaction = data
      } else {
        const amountMatch = text.match(/(?:ngn|usd|gbp|eur|\$|₦|£|€)\s*([\d,]+(?:\.\d+)?)/i)
        if (amountMatch) {
          const amount = Number(amountMatch[1].replace(/,/g, ''))
          const types = isWithdrawal ? WITHDRAW_TYPES : FUND_TYPES
          const { data } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('user_id', user.id)
            .in('type', types)
            .order('created_at', { ascending: false })
            .limit(80)
          transaction = data?.find(row => Math.abs(Number(row.amount) - amount) < 0.01) || null
        }
      }

      if (transaction) {
        setTransactions(previous => [transaction, ...previous.filter(row => row.id !== transaction.id)])
        setExpandedTx(transaction.id)
        requestAnimationFrame(() => {
          document.querySelector(`[data-wallet-transaction-id="${transaction.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
    }
    window.addEventListener('openWalletTransaction', handleOpenWalletTransaction)
    return () => window.removeEventListener('openWalletTransaction', handleOpenWalletTransaction)
  }, [user])

  const fundHistory     = transactions.filter(tx => FUND_TYPES.includes(tx.type))
  const withdrawHistory = transactions.filter(tx => WITHDRAW_TYPES.includes(tx.type))
  const activeHistory   = historyTab === 'fund' ? fundHistory : withdrawHistory

  const loadMoreTransactions = async () => {
    if (!user || loadingMore || !hasMoreTransactions) return
    setLoadingMore(true)
    const from = transactions.length
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, from + 59)
    if (error) {
      showToast('Could not load older wallet history.', 'error')
    } else {
      const olderTransactions = data || []
      setTransactions(current => [...current, ...olderTransactions])
      setHasMoreTransactions(olderTransactions.length === 60)
    }
    setLoadingMore(false)
  }

  const copyHistory = async () => {
    if (!activeHistory.length) return
    const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Transaction ID', 'Date', 'Type', 'Description', 'Amount', 'Currency', 'Status', 'Provider Reference'],
      ...activeHistory.map(tx => [
        tx.id,
        parseTimestamp(tx.created_at).toLocaleString(),
        tx.type,
        tx.description || tx.type.replace(/_/g, ' '),
        Number(tx.amount || 0),
        tx.currency || '',
        tx.status || '',
        tx.fincra_reference || '',
      ]),
    ]
    try {
      await navigator.clipboard.writeText(rows.map(row => row.map(csvCell).join('\t')).join('\n'))
      showToast(`${activeHistory.length} transactions copied.`, 'success')
    } catch (_) {
      showToast('Could not copy history. Check clipboard permissions.', 'error')
    }
  }

  const copyTransaction = async (tx) => {
    const currency = getCurrency(tx.currency || 'NGN')
    const details = [
      ['Transaction ID', tx.id],
      ['Type', tx.type.replace(/_/g, ' ')],
      ['Description', tx.description || '—'],
      ['Amount', `${WITHDRAW_TYPES.includes(tx.type) ? '-' : '+'}${currency.symbol}${Number(tx.amount || 0).toLocaleString()} ${tx.currency || ''}`],
      ['Status', tx.status || 'Unknown'],
      ['Provider reference', tx.fincra_reference || 'Not available'],
      ['Date', parseTimestamp(tx.created_at).toLocaleString()],
    ]
    try {
      await navigator.clipboard.writeText(details.map(([label, value]) => `${label}: ${value}`).join('\n'))
      showToast('Transaction details copied.', 'success')
    } catch (_) {
      showToast('Could not copy transaction. Check clipboard permissions.', 'error')
    }
  }

  const printHistoryAsPdf = () => {
    if (activeHistory.length) setShowStatementPreview(true)
  }

  const CURRENCY_TO_COUNTRY = {
    NGN: 'NG', GHS: 'GH', KES: 'KE', ZAR: 'ZA',
    USD: 'US', EUR: 'DE', GBP: 'GB'
  }

  const openFund = (wallet = null) => {
    setFundCurrency(wallet?.currency || wallets[0]?.currency || 'NGN')
    setAmount('')
    setFundError('')
    setShowFund(true)
  }

  const fundWallet = async () => {
    const value = Number(amount)
    setFundError('')
    if (!value || value <= 0) { setFundError('Enter an amount to fund.'); return }
    setFundLoading(true)
    try {
      const response = await startFincraWalletFunding(supabase, {
        amount: value,
        currency: fundCurrency,
        email: user.email,
        name: profile?.full_name || user.email,
        user_id: user.id,
      })
      if (!response?.checkoutUrl) throw new Error('Fincra did not return a checkout URL.')
      setCheckoutUrl(response.checkoutUrl)
      setShowFund(false)
    } catch (e) {
      setFundError(e.message || 'Could not start wallet funding.')
    }
    setFundLoading(false)
  }

  const openWithdraw = async (wallet) => {
    setActiveCurrency(wallet.currency)
    setShowWithdraw(true)
    setWithdrawError('')
    setWithdrawAmount('')
    setAccountNumber('')
    setVerifiedName('')
    setBankCode('')
    setBanks([])
    try {
      const country = CURRENCY_TO_COUNTRY[wallet.currency] || 'NG'
      const data = await listFincraBanks(supabase, country)
      const list = Array.isArray(data?.data) ? data.data : (data?.data?.banks || data?.banks || [])
      setBanks(list)
    } catch (e) { console.error('Load banks error:', e) }
  }

  const verifyWithdrawAccount = async () => {
    setWithdrawError('')
    setVerifiedName('')
    if (!accountNumber || accountNumber.length < 4 || !bankCode) {
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
    } catch (e) { setWithdrawError(e.message || 'Could not verify account') }
    setVerifying(false)
  }

  const submitWithdraw = async () => {
    setWithdrawError('')
    const value = Number(withdrawAmount)
    const wallet = wallets.find(w => w.currency === activeCurrency)
    if (!value || value <= 0) { setWithdrawError('Enter a valid amount'); return }
    if (value > Number(wallet?.balance || 0)) {
      setWithdrawError('Amount exceeds your wallet balance'); return
    }
    if (!verifiedName) { setWithdrawError('Please verify the account first'); return }
    setWithdrawing(true)
    try {
      await requestFincraPayout(supabase, {
        userId: user.id,
        source: 'wallet',
        currency: activeCurrency,
        amount: value,
        accountNumber,
        bankCode,
        accountName: verifiedName,
        email: user.email,
      })
      refreshProfile()
      setShowWithdraw(false)
      setHistoryTab('withdraw')
    } catch (e) { setWithdrawError(e.message || 'Withdrawal failed') }
    setWithdrawing(false)
  }

  const closeCheckout = () => {
    setCheckoutUrl(null)
    refreshProfile()
    fetchTransactions()
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--color-page)',
    border: '1.5px solid var(--color-border)',
    borderRadius: '12px',
    padding: '13px 14px',
    fontSize: '14px',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box'
  }

  return (
    <>
    {checkoutUrl && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(20,18,58,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)'
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text)' }}>Fund Wallet</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: '500' }}>🔒 Secured by Fincra</div>
          </div>
          <button  onClick={closeCheckout} style={{
            background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
            borderRadius: '10px', width: '36px', height: '36px',
            fontSize: '18px', color: 'var(--color-text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>×</button>
        </div>
        <iframe
          src={checkoutUrl}
          style={{ flex: 1, border: 'none', width: '100%' }}
          title="Fincra Checkout"
          onLoad={(e) => {
            try {
              if (e.target.contentWindow.location.href.includes('primaplug.com')) closeCheckout()
            } catch (_) {}
          }}
        />
      </div>
    )}

    <div className="wallet-page">

      {/* HEADER */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '4px' }}>
          Wallet
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Fund gigs, hold escrow, and receive worker payouts
        </div>
      </div>

      {/* WALLET CARDS */}
      {wallets.length === 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
          borderRadius: '24px', padding: '28px 24px', color: 'var(--color-surface)',
          marginBottom: '16px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>💰</div>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>No wallets yet</div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '20px' }}>
            Add money to get started — choose any supported currency
          </div>
          <button onClick={() => openFund()} style={{
            background: 'var(--color-surface)', border: 'none', borderRadius: '12px',
            padding: '13px 28px', color: 'var(--color-brand)', fontSize: '14px',
            fontWeight: '800', cursor: 'pointer', fontFamily: 'inherit'
          }}>
            💰 Fund Your First Wallet
          </button>
        </div>
      ) : (
        <>
          <div className="wallet-cards-grid" style={{
            gridTemplateColumns: wallets.length > 1
              ? 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))'
              : 'minmax(0, 680px)',
            justifyContent: wallets.length > 1 ? 'stretch' : 'center'
          }}>{wallets.map(wallet => {
            const cur = getCurrency(wallet.currency)
            const bal = Number(wallet.balance || 0)
            const held = Number(wallet.held_balance || 0)
            return (
              <div key={wallet.currency} style={{
                background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
                borderRadius: '24px', padding: '24px', color: 'var(--color-surface)',
                marginBottom: 0, position: 'relative', overflow: 'hidden'
              }}>
                <div style={{
                  fontSize: '12px', opacity: 0.8, textTransform: 'uppercase',
                  letterSpacing: '1.5px', marginBottom: '6px', fontWeight: '700'
                }}>
                  {wallet.currency} Wallet
                </div>
                <div style={{
                  fontSize: '40px', fontWeight: '800',
                  letterSpacing: '-1.5px', marginBottom: '2px', lineHeight: 1
                }}>
                  {cur.symbol}{bal.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: held > 0 ? '12px' : '18px' }}>
                  {cur.name}
                </div>

                {held > 0 && (
                  <div style={{
                    background: 'rgba(255,255,255,0.15)', borderRadius: '12px',
                    padding: '8px 12px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '14px'
                  }}>
                    <span style={{ fontSize: '12px', opacity: 0.85 }}>🔒 Held in escrow</span>
                    <strong style={{ fontSize: '12px' }}>{cur.symbol}{held.toLocaleString()}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => openFund(wallet)} style={{
                    flex: 1, background: 'var(--color-surface)', border: 'none', borderRadius: '12px',
                    padding: '11px', color: 'var(--color-brand)', fontSize: '12px', fontWeight: '800',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                  }}>
                    💰 Fund
                  </button>
                  <button onClick={() => openWithdraw(wallet)} style={{
                    flex: 1, background: 'rgba(255,255,255,0.18)',
                    border: '1.5px solid rgba(255,255,255,0.4)',
                    borderRadius: '12px', padding: '11px', color: 'var(--color-surface)',
                    fontSize: '12px', fontWeight: '800', cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                  }}>
                    💸 Withdraw
                  </button>
                </div>
              </div>
            )
          })}</div>

          {/* Add another currency */}
          <button onClick={() => openFund()} style={{
            width: '100%', background: 'var(--color-page)',
            border: '1.5px dashed var(--color-brand-border-strong)', borderRadius: '16px',
            padding: '14px', color: 'var(--color-brand)', fontSize: '13px', fontWeight: '700',
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: '20px'
          }}>
            + Add another currency wallet
          </button>
        </>
      )}

      {/* HISTORY TABS */}
      <div style={{
        display: 'flex', gap: '4px',
        background: 'var(--color-surface)', borderRadius: '14px',
        padding: '4px', border: '1.5px solid var(--color-border)',
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
              flex: 1, background: historyTab === tab.key ? 'var(--color-brand)' : 'transparent',
              border: 'none', borderRadius: '10px', padding: '10px 6px',
              fontSize: '12px', fontWeight: historyTab === tab.key ? '700' : '500',
              color: historyTab === tab.key ? 'var(--color-surface)' : 'var(--color-text-muted)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
            }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: '6px',
                background: historyTab === tab.key ? 'rgba(255,255,255,0.25)' : 'var(--color-brand-soft)',
                color: historyTab === tab.key ? 'var(--color-surface)' : 'var(--color-brand)',
                borderRadius: '10px', padding: '1px 7px',
                fontSize: '12px', fontWeight: '800'
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '10px', flexWrap: 'wrap', margin: '0 2px 12px'
      }}>
        <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
          {activeHistory.length} {historyTab === 'fund' ? 'funding' : 'withdrawal'} transaction{activeHistory.length === 1 ? '' : 's'}
          {hasMoreTransactions && ' · Load older transactions before exporting to include them'}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={copyHistory} disabled={!activeHistory.length} style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: '9px', padding: '8px 12px', color: 'var(--color-text)',
            fontSize: '12px', fontWeight: '700', cursor: activeHistory.length ? 'pointer' : 'not-allowed',
            opacity: activeHistory.length ? 1 : 0.55, fontFamily: 'inherit'
          }}>Copy history</button>
          <button onClick={printHistoryAsPdf} disabled={!activeHistory.length} style={{
            background: 'var(--color-brand)', border: '1px solid var(--color-brand)',
            borderRadius: '9px', padding: '8px 12px', color: 'var(--color-surface)',
            fontSize: '12px', fontWeight: '700', cursor: activeHistory.length ? 'pointer' : 'not-allowed',
            opacity: activeHistory.length ? 1 : 0.55, fontFamily: 'inherit'
          }}>Print / Save PDF</button>
        </div>
      </div>

      {/* HISTORY LIST */}
      {activeHistory.length === 0 ? (
        <div style={{
          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
          borderRadius: '18px', padding: '36px 20px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>
            {historyTab === 'fund' ? '💰' : '💸'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '4px' }}>
            {historyTab === 'fund' ? 'No funding yet' : 'No withdrawals yet'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
            {historyTab === 'fund'
              ? 'Money you add to your wallet will show up here'
              : 'Money you send to your bank will show up here'}
          </div>
        </div>
      ) : activeHistory.map(tx => {
        const st = STATUS_STYLE[tx.status] || STATUS_STYLE.pending
        const isOutflow = WITHDRAW_TYPES.includes(tx.type)
        const isExpanded = expandedTx === tx.id
        const txCur = getCurrency(tx.currency || 'NGN')
        return (
          <div
            key={tx.id}
            data-wallet-transaction-id={tx.id}
            onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
            style={{
              background: 'var(--color-surface)', border: `1.5px solid ${isExpanded ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
              borderRadius: '16px', padding: '14px 16px',
              marginBottom: '10px', cursor: 'pointer', transition: 'all 0.15s'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '11px',
                  background: isOutflow ? 'var(--color-warning-soft)' : 'var(--color-success-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', flexShrink: 0
                }}>{isOutflow ? '↑' : '↓'}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '3px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {tx.description || tx.type.replace(/_/g, ' ')}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{timeAgo(tx.created_at)}</span>
                    <span style={{
                      fontSize: '12px', fontWeight: '800', color: st.color, background: st.bg,
                      borderRadius: '6px', padding: '2px 7px',
                      textTransform: 'uppercase', letterSpacing: '0.4px'
                    }}>{st.label}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <div style={{
                  fontSize: '14px', fontWeight: '800', flexShrink: 0,
                  color: isOutflow ? 'var(--color-warning)' : 'var(--color-success)'
                }}>
                  {isOutflow ? '-' : '+'}{txCur.symbol}{Number(tx.amount || 0).toLocaleString()}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{
                marginTop: '12px', paddingTop: '12px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                {[
                  ['Transaction ID', tx.id],
                  ['Type', tx.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())],
                  ['Amount', `${txCur.symbol}${Number(tx.amount || 0).toLocaleString()} ${tx.currency || ''}`],
                  ['Status', tx.status],
                  tx.balance_after != null && ['Balance After', `${txCur.symbol}${Number(tx.balance_after).toLocaleString()}`],
                  tx.fincra_reference && ['Provider Reference', tx.fincra_reference],
                  ['Date', parseTimestamp(tx.created_at).toLocaleString()],
                ].filter(Boolean).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '600', flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text)', fontWeight: '600', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); copyTransaction(tx) }}
                    style={{
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: '8px', padding: '7px 10px', color: 'var(--color-text)',
                      fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit'
                    }}>Copy transaction</button>
                  <a
                    href={reportIssueLink(tx)}
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)',
                      borderRadius: '8px', padding: '7px 10px', color: 'var(--color-danger)',
                      fontSize: '12px', fontWeight: '700', textDecoration: 'none'
                    }}>Report an issue</a>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {hasMoreTransactions && (
        <button onClick={loadMoreTransactions} disabled={loadingMore} style={{
          display: 'block', margin: '4px auto 20px', background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px 16px',
          color: 'var(--color-brand)', fontSize: '13px', fontWeight: '700',
          cursor: loadingMore ? 'wait' : 'pointer', fontFamily: 'inherit'
        }}>
          {loadingMore ? 'Loading…' : 'Load older transactions'}
        </button>
      )}

      {/* FUND MODAL */}
      {showFund && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }} onClick={() => setShowFund(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-surface)', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: '540px', padding: '20px', paddingBottom: '32px'
          }}>
            <div style={{ width: '40px', height: '4px', background: 'var(--color-border)', borderRadius: '2px', margin: '0 auto 18px' }} />
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '4px' }}>
              Fund Wallet
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '18px' }}>
              Add money to pay workers instantly
            </div>

            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Currency
            </label>
            <select
              value={fundCurrency}
              onChange={e => setFundCurrency(e.target.value)}
              style={{ ...inputStyle, marginBottom: '14px' }}>
              {FINCRA_CURRENCIES.map(c => (
                <option key={c} value={c}>{getCurrency(c).symbol} {c} — {getCurrency(c).name}</option>
              ))}
            </select>

            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Amount
            </label>
            <input
              type="number" min="1" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ ...inputStyle, fontSize: '20px', fontWeight: '700', marginBottom: '14px' }}
            />

            {fundError && (
              <div style={{
                background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: 'var(--color-danger)', fontWeight: '600', marginBottom: '14px'
              }}>{fundError}</div>
            )}

            <button onClick={fundWallet} disabled={fundLoading} style={{
              width: '100%',
              background: fundLoading ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
              border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
              cursor: fundLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              boxShadow: fundLoading ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
            }}>
              {fundLoading ? 'Redirecting to Fincra...' : 'Continue to Payment →'}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', textAlign: 'center', marginTop: '12px' }}>
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
            background: 'var(--color-surface)', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: '540px', padding: '20px', paddingBottom: '32px'
          }}>
            <div style={{ width: '40px', height: '4px', background: 'var(--color-border)', borderRadius: '2px', margin: '0 auto 18px' }} />
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '2px' }}>
              Withdraw from {activeCurrency} Wallet
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              Send money straight to your bank — no minimum
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700', marginBottom: '16px' }}>
              Available: {getCurrency(activeCurrency).symbol}{Number(wallets.find(w => w.currency === activeCurrency)?.balance || 0).toLocaleString()} {activeCurrency}
            </div>

            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Bank
            </label>
            <select
              value={bankCode}
              onChange={e => { setBankCode(e.target.value); setVerifiedName('') }}
              style={{ ...inputStyle, marginBottom: '10px' }}>
              <option value="">Select your bank</option>
              {banks.map((b, i) => <option key={i} value={b.code}>{b.name}</option>)}
            </select>

            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Account Number
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                value={accountNumber}
                onChange={e => { setAccountNumber(e.target.value); setVerifiedName('') }}
                placeholder="0123456789" maxLength={34}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={verifyWithdrawAccount} disabled={verifying} style={{
                padding: '0 18px', background: 'var(--color-brand)', color: 'var(--color-surface)',
                border: 'none', borderRadius: '12px', fontSize: '13px',
                fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}>
                {verifying ? '...' : 'Verify'}
              </button>
            </div>

            {verifiedName && (
              <div style={{
                background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '13px', color: 'var(--color-success)', fontWeight: '700', marginBottom: '14px'
              }}>✓ {verifiedName}</div>
            )}

            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Amount ({activeCurrency})
            </label>
            <input
              type="number" value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder={`Amount in ${activeCurrency}`}
              style={{ ...inputStyle, fontSize: '20px', fontWeight: '700', marginBottom: '14px' }}
            />

            {withdrawError && (
              <div style={{
                background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: 'var(--color-danger)', fontWeight: '600', marginBottom: '14px'
              }}>{withdrawError}</div>
            )}

            <button onClick={submitWithdraw} disabled={withdrawing || !verifiedName} style={{
              width: '100%', padding: '14px',
              background: (withdrawing || !verifiedName) ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
              border: 'none', borderRadius: '12px', color: 'var(--color-surface)', fontWeight: '700',
              fontSize: '14px', cursor: (withdrawing || !verifiedName) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: (withdrawing || !verifiedName) ? 'none' : '0 4px 16px rgba(108,71,255,0.35)'
            }}>
              {withdrawing ? 'Processing...' : 'Withdraw →'}
            </button>
          </div>
        </div>
      )}
    </div>
    {showStatementPreview && (
      <div className="wallet-print-overlay" onClick={() => setShowStatementPreview(false)}>
        <section className="wallet-statement-print" role="dialog" aria-modal="true" aria-labelledby="wallet-statement-title" onClick={event => event.stopPropagation()}>
          <div className="wallet-statement-actions">
            <button type="button" onClick={() => setShowStatementPreview(false)}>Close</button>
            <button type="button" className="wallet-statement-print-button" onClick={() => window.print()}>Print / Save PDF</button>
          </div>
          <h2 id="wallet-statement-title">{historyTab === 'fund' ? 'Funding History' : 'Withdrawal History'}</h2>
          <p className="wallet-statement-meta">{profile?.full_name || user?.email || 'Prima member'} ? Generated {new Date().toLocaleString()} ? {activeHistory.length} transactions</p>
          <div className="wallet-statement-table-wrap">
            <table className="wallet-statement-table">
              <thead><tr><th>Transaction ID</th><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Status</th><th>Provider Reference</th></tr></thead>
              <tbody>{activeHistory.map(tx => {
                const currency = getCurrency(tx.currency || 'NGN')
                const amount = `${WITHDRAW_TYPES.includes(tx.type) ? '-' : '+'}${currency.symbol}${Number(tx.amount || 0).toLocaleString()} ${tx.currency || ''}`
                return <tr key={tx.id}><td>{tx.id}</td><td>{parseTimestamp(tx.created_at).toLocaleString()}</td><td>{tx.type.replace(/_/g, ' ')}</td><td>{tx.description || ''}</td><td>{amount}</td><td>{tx.status || ''}</td><td>{tx.fincra_reference || ''}</td></tr>
              })}</tbody>
            </table>
          </div>
        </section>
      </div>
    )}
    </>
  )
}
