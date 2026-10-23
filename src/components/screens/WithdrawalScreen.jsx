import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useCredits } from '../../context/CreditsContext'
import { useAuth } from '../../context/AuthContext'
import { CREDITS_PER_DOLLAR, MIN_WITHDRAWAL_CREDITS } from '../../utils/payments'
import { quoteFincraCreditPayout, requestFincraCreditPayout, listFincraBanks, verifyFincraAccount } from '../../utils/fincra'
import { FINCRA_BANK_PAYOUT_COUNTRIES, FINCRA_BANK_PAYOUT_CURRENCIES, FINCRA_PAYOUT_CURRENCY_LABELS, getFincraPaymentSchemes } from '../../utils/fincraPayoutRoutes'

const MIN_CREDITS = MIN_WITHDRAWAL_CREDITS

export default function WithdrawalScreen() {
  const { credits, fetchCredits } = useCredits()
  const { user } = useAuth()

  const [banks, setBanks] = useState([])
  const [bankCode, setBankCode] = useState('')
  const [bankSearch, setBankSearch] = useState('')
  const [showBankList, setShowBankList] = useState(false)
  const [accountNumber, setAccountNumber] = useState('')
  const [sortCode, setSortCode] = useState('')
  const [verifiedName, setVerifiedName] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [destinationCountry, setDestinationCountry] = useState('NG')
  const [destinationCurrency, setDestinationCurrency] = useState('NGN')
  const [paymentScheme, setPaymentScheme] = useState('')
  const [beneficiaryAddress, setBeneficiaryAddress] = useState({ street: '', city: '', state: '', zip: '' })
  const [bankAddress, setBankAddress] = useState({ street: '', city: '', state: '', zip: '' })
  const [loadingBanks, setLoadingBanks] = useState(false)

  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteExpiresAt, setQuoteExpiresAt] = useState(0)
  const [payoutStatus, setPayoutStatus] = useState('')
  const [withdrawalHistory, setWithdrawalHistory] = useState([])

  const balance = credits?.balance || 0
  const dollarValue = balance / CREDITS_PER_DOLLAR
  const creditsToWithdraw = parseInt(amount) || 0
  const dollarPayout = creditsToWithdraw / CREDITS_PER_DOLLAR
  const paymentSchemes = getFincraPaymentSchemes(destinationCurrency, destinationCountry)
  const requiresAccountVerification = destinationCountry === 'NG' && destinationCurrency === 'NGN'

  useEffect(() => {
    loadBanks(destinationCountry, destinationCurrency)
    loadWithdrawalHistory()
  }, [destinationCountry, destinationCurrency])

  useEffect(() => {
    setPaymentScheme(getFincraPaymentSchemes(destinationCurrency, destinationCountry)[0] || '')
  }, [destinationCountry, destinationCurrency])

  const loadBanks = async (country, currency) => {
    setLoadingBanks(true)
    setBanks([])
    setBankCode('')
    setBankSearch('')
    setAccountNumber('')
    setSortCode('')
    setVerifiedName('')
    setQuote(null)
    setBeneficiaryAddress({ street: '', city: '', state: '', zip: '' })
    setBankAddress({ street: '', city: '', state: '', zip: '' })
    try {
      const data = await listFincraBanks(supabase, country, currency)
      const list = Array.isArray(data?.data) ? data.data : (data?.data?.banks || data?.banks || [])
      setBanks(list)
    } catch (e) {
      console.error('Load banks error:', e)
    } finally {
      setLoadingBanks(false)
    }
  }

  const loadWithdrawalHistory = async () => {
    const { data, error: historyError } = await supabase
      .from('credit_withdrawals')
      .select('id, credits_amount, destination_currency, destination_amount, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    if (!historyError) setWithdrawalHistory(data || [])
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
    fontSize: '12px', fontWeight: '700',
    color: 'var(--color-text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.8px', display: 'block', marginBottom: '6px'
  }

  const inputStyle = {
    width: '100%', background: 'var(--color-page)',
    border: '1.5px solid var(--color-border)', borderRadius: '10px',
    padding: '11px 14px', fontSize: '13px',
    color: 'var(--color-text)', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box'
  }

  const handleGetQuote = async () => {
    setError('')
    if (creditsToWithdraw < MIN_CREDITS) {
      return setError(`Minimum withdrawal is ${MIN_CREDITS} credits ($${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}).`)
    }
    if (creditsToWithdraw > balance) return setError('Insufficient credits balance.')

    setSubmitting(true)
    setQuote(null)
    try {
      const freshQuote = await quoteFincraCreditPayout(supabase, {
        creditsAmount: creditsToWithdraw,
        destinationCurrency,
        destinationCountry,
        paymentScheme: paymentScheme || null,
      })
      setQuote(freshQuote)
      setQuoteExpiresAt(Date.now() + (Number(freshQuote.expiresInSeconds) || 30) * 1000)
    } catch (e) {
      setError(e.message || 'Could not get a payout quote. Please try again.')
    }
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    setError('')
    if (!quote?.quoteId) return setError('Get a fresh payout quote before confirming.')
    if (Date.now() >= quoteExpiresAt) {
      setQuote(null)
      return setError('The quote expired. Get a new quote before confirming.')
    }
    if (creditsToWithdraw !== Number(quote.creditsAmount)) {
      setQuote(null)
      return setError('The withdrawal amount changed. Get a new quote before confirming.')
    }
    if (!bankCode || !accountNumber) return setError('Select your bank and enter your account number.')
    if (destinationCurrency === 'GBP' && !/^\d{6}$/.test(sortCode.replace(/[-\s]/g, ''))) {
      return setError('Enter the 6-digit sort code for the GBP account.')
    }
    if (!verifiedName) return setError('Please verify your account before withdrawing.')

    setSubmitting(true)
    try {
      const result = await requestFincraCreditPayout(supabase, {
        quoteId: quote.quoteId,
        accountNumber,
        bankCode,
        accountName: verifiedName,
        bankName: banks.find(bank => String(bank.code) === String(bankCode))?.name,
        bankSwiftCode: banks.find(bank => String(bank.code) === String(bankCode))?.swiftCode || banks.find(bank => String(bank.code) === String(bankCode))?.bic,
        sortCode: destinationCurrency === 'GBP' ? sortCode.replace(/[-\s]/g, '') : null,
        beneficiaryAddress,
        bankAddress,
      })
      await Promise.allSettled([fetchCredits(), loadWithdrawalHistory()])
      setPayoutStatus(result.status === 'recovery_required'
        ? 'Fincra may have converted the funds already. Your credits remain reserved while Prima reconciles the payout; do not submit it again.'
        : result.status === 'pending'
          ? 'Payout status is being confirmed. Your credits are reserved; do not submit again.'
          : 'Your withdrawal is being processed by Fincra.')
      setDone(true)
    } catch (e) {
      // The request can time out after the server reserves credits or Fincra
      // accepts the payout. Check the durable record before inviting a retry.
      const { data: existingWithdrawal } = quote?.quoteId
        ? await supabase.from('credit_withdrawals')
          .select('id, status')
          .eq('quote_id', quote.quoteId)
          .maybeSingle()
        : { data: null }
      if (existingWithdrawal) {
        await Promise.allSettled([fetchCredits(), loadWithdrawalHistory()])
        setPayoutStatus('The request reached the server and is being processed. Your credits are reserved; do not submit it again.')
        setDone(true)
      } else {
        setError(e.message || 'The request could not be confirmed. Please check your withdrawal history before trying again.')
      }
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
          color: 'var(--color-text)', marginBottom: '8px'
        }}>{payoutStatus.includes('reconciles') ? 'Withdrawal under review' : payoutStatus.startsWith('Payout status is being confirmed') ? 'Withdrawal pending' : 'Withdrawal submitted'}</div>
        <div style={{
          fontSize: '14px', color: 'var(--color-text-muted)',
          lineHeight: '1.6', marginBottom: '24px',
          maxWidth: '280px', margin: '0 auto 24px'
        }}>
          {payoutStatus} You requested {quote?.destinationCurrency || 'NGN'} {Number(quote?.destinationAmount || 0).toLocaleString()} to {verifiedName}.
        </div>
        <button
          onClick={() => {
            setDone(false); setAmount(''); setBankCode(''); setBankSearch('')
            setAccountNumber(''); setVerifiedName(''); setQuote(null); setPayoutStatus('')
          }}
          style={{
            background: 'var(--color-brand-gradient)',
            border: 'none', borderRadius: '14px',
            padding: '14px 32px', fontSize: '14px',
            fontWeight: '700', color: 'var(--color-surface)',
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
        color: 'var(--color-text)', marginBottom: '4px'
      }}>Withdraw Credits</div>
      <div style={{
        fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px'
      }}>Convert Prima Credits to cash</div>

      {/* Balance Card */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
        borderRadius: '20px', padding: '20px',
        color: 'var(--color-surface)', marginBottom: '24px', textAlign: 'center'
      }}>
        <div style={{
          fontSize: '12px', opacity: 0.8,
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
        background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
        borderRadius: '14px', padding: '14px',
        marginBottom: '20px', display: 'flex',
        gap: '10px', alignItems: 'center'
      }}>
        <span style={{ fontSize: '20px', flexShrink: 0 }}>ℹ️</span>
        <div style={{ fontSize: '12px', color: 'var(--color-brand)', lineHeight: '1.6' }}>
          <strong>{CREDITS_PER_DOLLAR} Credits = $1 USD.</strong> Minimum withdrawal is {MIN_CREDITS} credits (${(MIN_CREDITS / CREDITS_PER_DOLLAR).toFixed(2)}). Sent automatically via Fincra.
        </div>
      </div>

      {/* Bank selection */}
      {withdrawalHistory.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '8px' }}>
            Recent withdrawals
          </div>
          {withdrawalHistory.map(item => (
            <div key={item.id} style={{
              display: 'flex', justifyContent: 'space-between', gap: '12px',
              padding: '10px 12px', marginBottom: '6px', borderRadius: '10px',
              background: 'var(--color-page)', fontSize: '12px', color: 'var(--color-text-muted)'
            }}>
              <span>{item.credits_amount} credits → {item.destination_currency} {Number(item.destination_amount).toLocaleString()}</span>
              <strong style={{ color: item.status === 'failed' ? 'var(--color-danger)' : 'var(--color-brand)' }}>
                {item.status}
              </strong>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Bank country</label>
        <select value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} style={inputStyle}>
          {FINCRA_BANK_PAYOUT_COUNTRIES.map(country => (
            <option key={country.code} value={country.code}>{country.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Payout currency</label>
        <select value={destinationCurrency} onChange={e => setDestinationCurrency(e.target.value)} style={inputStyle}>
          {FINCRA_BANK_PAYOUT_CURRENCIES.map(currency => (
            <option key={currency} value={currency}>{FINCRA_PAYOUT_CURRENCY_LABELS[currency]}</option>
          ))}
        </select>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '5px' }}>
          Only country and currency combinations enabled for Fincra bank payouts will load a bank list.
        </div>
        {destinationCurrency === 'USD' && destinationCountry === 'NG' && (
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '5px' }}>
            Nigerian USD payouts require a USD domiciliary account at a Fincra-supported bank.
          </div>
        )}
      </div>

      {paymentSchemes.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Payment scheme</label>
          <select value={paymentScheme} onChange={e => { setPaymentScheme(e.target.value); setQuote(null) }} style={inputStyle}>
            {paymentSchemes.map(scheme => <option key={scheme} value={scheme}>{scheme.toUpperCase()}</option>)}
          </select>
        </div>
      )}

      {/* Bank selection */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Bank</label>
        <div
          onClick={() => banks.length > 0 && setShowBankList(true)}
          style={{
            ...inputStyle, display: 'flex', alignItems: 'center',
            gap: '8px', cursor: banks.length > 0 ? 'pointer' : 'not-allowed',
            border: bankCode ? '1.5px solid var(--color-brand)' : '1.5px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: '14px', flexShrink: 0 }}>🏦</span>
          <span style={{ flex: 1, fontSize: '13px', color: bankCode ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
            {loadingBanks ? 'Loading enabled banks...' : banks.find(b => String(b.code) === String(bankCode))?.name || (banks.length ? 'Search and select your bank' : 'No enabled banks for this route')}
          </span>
          {bankCode
            ? <span style={{ fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); setBankCode(''); setBankSearch(''); setVerifiedName('') }}>✕</span>
            : <span style={{ fontSize: '16px', color: 'var(--color-text-muted)' }}>›</span>
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
            background: 'var(--color-surface)', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: '540px',
            height: '75vh', display: 'flex', flexDirection: 'column',
            padding: '0 0 20px',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
              <div style={{ width: '40px', height: '4px', background: 'var(--color-border)', borderRadius: '2px' }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '14px' }}>
              Select Bank
            </div>

            {/* Search */}
            <div style={{ padding: '0 16px 12px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
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
                    color: 'var(--color-text)', fontFamily: 'inherit',
                  }}
                />
                {bankSearch && (
                  <span onClick={() => setBankSearch('')}
                    style={{ fontSize: '12px', color: 'var(--color-text-muted)', cursor: 'pointer', fontWeight: '700' }}>✕</span>
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
                      color: b.code === bankCode ? 'var(--color-brand)' : 'var(--color-text)',
                      background: b.code === bankCode ? 'var(--color-page)' : 'transparent',
                      fontWeight: b.code === bankCode ? '700' : '500',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--color-page)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>{b.name}</span>
                    {b.code === bankCode && <span style={{ fontSize: '16px', color: 'var(--color-brand)' }}>✓</span>}
                  </div>
                ))
              }
              {banks.filter(b => b.name?.toLowerCase().includes(bankSearch.toLowerCase())).length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
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
            placeholder={destinationCountry === 'NG' && destinationCurrency === 'NGN' ? '10-digit account number' : 'Bank account number or IBAN'}
            maxLength={34}
            value={accountNumber}
            onChange={e => { setAccountNumber(e.target.value); setVerifiedName('') }}
          />
          {requiresAccountVerification && (
            <button
              onClick={verifyAccount}
              disabled={verifying}
              style={{
                padding: '0 16px', background: 'var(--color-brand)', color: 'var(--color-surface)',
                border: 'none', borderRadius: '10px', fontSize: '12px',
                fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap'
              }}>
              {verifying ? '...' : 'Verify'}
            </button>
          )}
        </div>
      </div>

      {destinationCurrency === 'GBP' && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>UK sort code</label>
          <input
            style={inputStyle}
            inputMode="numeric"
            maxLength={8}
            value={sortCode}
            onChange={e => { setSortCode(e.target.value); setQuote(null) }}
            placeholder="12-34-56"
          />
        </div>
      )}

      {!requiresAccountVerification && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Account holder name</label>
          <input
            style={inputStyle}
            value={verifiedName}
            onChange={e => setVerifiedName(e.target.value)}
            placeholder="Name exactly as held by the bank"
          />
        </div>
      )}

      {paymentScheme === 'swift' && (
        <>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', margin: '12px 0 8px' }}>
            Beneficiary address (required for SWIFT)
          </div>
          {['street', 'city', 'state', 'zip'].map(field => (
            <input key={`beneficiary-${field}`} style={{ ...inputStyle, marginBottom: '8px' }}
              value={beneficiaryAddress[field]}
              onChange={e => setBeneficiaryAddress(current => ({ ...current, [field]: e.target.value }))}
              placeholder={`Beneficiary ${field}`} />
          ))}
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', margin: '12px 0 8px' }}>
            Bank address (required for SWIFT)
          </div>
          {['street', 'city', 'state', 'zip'].map(field => (
            <input key={`bank-${field}`} style={{ ...inputStyle, marginBottom: '8px' }}
              value={bankAddress[field]}
              onChange={e => setBankAddress(current => ({ ...current, [field]: e.target.value }))}
              placeholder={`Bank ${field}`} />
          ))}
        </>
      )}

      {verifiedName && (
        <div style={{
          background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
          borderRadius: '10px', padding: '10px 12px',
          fontSize: '13px', color: 'var(--color-success)', fontWeight: '700',
          marginBottom: '20px'
        }}>✓ {verifiedName}</div>
      )}

      {/* Amount Input */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: 'var(--color-text)', marginBottom: '8px'
        }}>Credits to Withdraw</div>
        <input
          type="number"
          value={amount}
          onChange={e => { setAmount(e.target.value); setQuote(null) }}
          placeholder={`Min ${MIN_CREDITS} credits`}
          min={MIN_CREDITS}
          max={balance}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
            borderRadius: '12px', padding: '14px 16px',
            fontSize: '16px', fontWeight: '700',
            color: 'var(--color-text)', fontFamily: 'inherit',
            outline: 'none'
          }}
        />
        {creditsToWithdraw > 0 && (
          <div style={{
            fontSize: '12px', color: 'var(--color-success)',
            fontWeight: '600', marginTop: '6px'
          }}>
            ≈ ${dollarPayout.toFixed(2)} USD payout
          </div>
        )}
      </div>

      {quote && (
        <div style={{
          background: 'var(--color-page)', border: '1.5px solid var(--color-brand-border-strong)',
          borderRadius: '12px', padding: '14px', marginBottom: '16px',
          fontSize: '13px', color: 'var(--color-text)', lineHeight: '1.7'
        }}>
          <strong>Live payout quote</strong><br />
          You pay: {quote.creditsAmount} credits (${Number(quote.usdAmount).toFixed(2)} USD)<br />
          You receive: {quote.destinationCurrency} {Number(quote.destinationAmount).toLocaleString()} in {FINCRA_BANK_PAYOUT_COUNTRIES.find(country => country.code === quote.destinationCountry)?.name || quote.destinationCountry}<br />
          Exchange rate: {quote.exchangeRate}<br />
          Payout fees: covered by Prima<br />
          Quote expires shortly; get a new quote if it expires.
        </div>
      )}

      {error && (
        <div style={{
          background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
          borderRadius: '12px', padding: '12px 14px',
          fontSize: '13px', color: 'var(--color-danger)',
          marginBottom: '16px', fontWeight: '600'
        }}>{error}</div>
      )}

      <button
        onClick={quote ? handleSubmit : handleGetQuote}
        disabled={submitting || !verifiedName}
        style={{
          width: '100%',
          background: (submitting || !verifiedName)
            ? 'var(--color-brand-border-strong)'
            : 'var(--color-brand-gradient)',
          border: 'none', borderRadius: '14px',
          padding: '16px', fontSize: '15px',
          fontWeight: '700', color: 'var(--color-surface)',
          cursor: (submitting || !verifiedName) ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: (submitting || !verifiedName) ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
          transition: 'all 0.2s'
        }}>
        {submitting ? 'Processing...' : quote ? 'Confirm withdrawal' : 'Get live payout quote'}
      </button>

      <div style={{
        fontSize: '12px', color: 'var(--color-text-subtle)',
        textAlign: 'center', marginTop: '10px',
        lineHeight: '1.6', background: 'var(--color-page)',
        borderRadius: '10px', padding: '10px 14px'
      }}>
        Credits are reserved when you confirm. Payouts are processed by Fincra and may take time.<br/>
        If Fincra rejects a payout, the credits are returned automatically. A pending payout stays reserved until Fincra confirms its result.
      </div>
    </div>
  )
}
