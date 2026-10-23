import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { uploadToR2 } from '../utils/r2upload'
import { CURRENCIES, getCurrency } from '../data/currencies'
import { getPendingGigReferralForPayout } from '../utils/referral'
import { updateWorkerLevel } from '../utils/workerLevel'
import { calculateCommission, calculateWorkerEscrowShare, PAYMENT_METHODS } from '../utils/payments'
import ConfirmDialog from './ConfirmDialog'

export default function ReceiptFlow({ gig, application, onClose, onComplete }) {
  const { user } = useAuth()
  const [step, setStep] = useState('start')
  const [receipt, setReceipt] = useState(null)
  const [amount, setAmount] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState(gig?.currency || 'USD')
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [receiptFile, setReceiptFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [hasReferral, setHasReferral] = useState(false)

  const isPoster = gig?.poster_id === user?.id
  const workerId = application?.worker_id || gig?.worker_id
  const isWorker = workerId === user?.id
  const currency = getCurrency(gig?.currency || 'NGN')
  const isWalletGig = gig?.payment_method === PAYMENT_METHODS.WALLET

  useEffect(() => {
    let active = true
    if (!gig?.id || !workerId || !isWorker) {
      setHasReferral(false)
      return () => { active = false }
    }
    getPendingGigReferralForPayout(gig.id, workerId)
      .then(referral => {
        if (!active) return
        const storedRate = Number(receipt?.amount) > 0
          ? Number(receipt?.commission_amount) / Number(receipt.amount)
          : 0
        setHasReferral(Boolean(referral) || storedRate > 0.1001)
      })
    return () => { active = false }
  }, [gig?.id, workerId, isWorker, receipt?.amount, receipt?.commission_amount])

  const fetchReceipt = useCallback(async () => {
    if (!gig) return
    let data = null
    if (application?.id) {
      const result = await supabase.from('receipts').select('*')
        .eq('application_id', application.id).maybeSingle()
      if (result.error) throw result.error
      data = result.data
      if (!data) {
        const legacy = await supabase.from('receipts').select('*')
          .eq('gig_id', gig.id).eq('worker_id', workerId)
          .is('application_id', null).maybeSingle()
        if (legacy.error) throw legacy.error
        data = legacy.data
      }
    } else {
      const result = await supabase.from('receipts').select('*')
        .eq('gig_id', gig.id).eq('worker_id', workerId).maybeSingle()
      if (result.error) throw result.error
      data = result.data
    }
    if (data) {
      setReceipt(data)
      // Determine step based on receipt state
      if (data.completed) {
        setStep('done')
      } else if (data.disputed) {
        setStep('disputed')
      } else if (isPoster && !data.poster_confirmed) {
        setStep('poster_amount')
      } else if (isWorker && data.poster_confirmed && !data.worker_confirmed) {
        setStep('worker_confirm')
      } else if (isPoster && data.poster_confirmed) {
        setStep('waiting_worker')
      } else {
        setStep('start')
      }
    } else {
      setStep(isPoster ? 'poster_amount' : 'waiting_poster')
    }
  }, [gig, application, workerId, isPoster, isWorker])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReceipt().catch(e => setError('Unable to load receipt: ' + e.message))
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchReceipt])

  const handlePosterSubmit = async () => {
    // Escrow is locked per accepted application, even when the gig has
    // multiple worker slots.
    const walletAmount = Number(gig?.pay_min || 0)
    if (!isWalletGig && (!amount || parseFloat(amount) <= 0)) {
      setError('Please enter the amount you paid')
      return
    }

    if (!isWalletGig && gig?.pay_min && parseFloat(amount) < Number(gig.pay_min)) {
      setError(
        `Amount cannot be less than the minimum pay (${CURRENCIES.find(c => c.code === selectedCurrency)?.symbol || ''
        }${gig.pay_min})`
      )
      return
    }

    if (!isWalletGig && !receiptFile) {
      setError('Please upload payment proof before confirming')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const gigAmount = isWalletGig ? walletAmount : parseFloat(amount)
      const receiptCurrency = gig?.currency || selectedCurrency
      const commissionAmount = calculateCommission(gigAmount)

      if (isWalletGig && application?.id) {
        const { data: escrowReady, error: escrowError } = await supabase.rpc(
          'ensure_gig_application_escrow',
          { p_application_id: application.id }
        )
        if (escrowError) throw escrowError
        if (!escrowReady) throw new Error('Wallet balance is not enough to restore this worker’s escrow.')
      }

      // Check if receipt exists
      let lookup = supabase.from('receipts').select('id')
      lookup = application?.id
        ? lookup.eq('application_id', application.id)
        : lookup.eq('gig_id', gig.id).eq('worker_id', workerId)
      const { data: existing, error: lookupError } = await lookup.maybeSingle()
      if (lookupError) throw lookupError

      if (existing) {
        const { error } = await supabase
          .from('receipts')
          .update({
            amount: gigAmount,
            currency: receiptCurrency,
            commission_amount: commissionAmount,
            poster_confirmed: true,
            poster_confirmed_at: new Date().toISOString(),
            poster_receipt_url: isWalletGig ? null : (receiptFile || null),
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('receipts').insert({
          gig_id: gig.id,
          application_id: application?.id || null,
          poster_id: gig.poster_id,
          worker_id: workerId,
          amount: gigAmount,
          currency: receiptCurrency,
          commission_amount: commissionAmount,
          poster_confirmed: true,
          poster_confirmed_at: new Date().toISOString(),
          worker_confirmed: false,
          completed: false,
          poster_receipt_url: isWalletGig ? null : (receiptFile || null),
        })
        if (error) throw error
      }

      // Notify worker with currency info
      const currSymbol = CURRENCIES.find(c => c.code === receiptCurrency)?.symbol
      await supabase.from('notifications').insert({
        user_id: workerId,
        title: '📎 Receipt Submitted',
        message: isWalletGig
          ? `Poster marked "${gig.title}" complete. Please confirm so escrow can release.`
          : `Poster confirmed payment of ${currSymbol}${gigAmount.toLocaleString()} ${receiptCurrency} for "${gig.title}". Please confirm you received this amount.`,
        type: 'receipt',
        gig_id: gig.id,
        application_id: application?.id || null
      })

      setStep('waiting_worker')
    } catch (e) {
      setError('Error submitting receipt: ' + e.message)
    }
    setSubmitting(false)
  }

  const handleWorkerConfirm = async (agreed) => {
    setSubmitting(true)
    setError(null)

    try {
      let currentReceipt = receipt
      if (!currentReceipt) {
        let query = supabase.from('receipts').select('*')
        if (application?.id) query = query.eq('application_id', application.id)
        else query = query.eq('gig_id', gig.id).eq('worker_id', workerId)
        const { data, error } = await query.maybeSingle()
        if (error) throw error
        currentReceipt = data
      }
      if (!currentReceipt) throw new Error('Receipt was not found. Refresh and try again.')

      if (!agreed) {
        const { error: disputeError } = await supabase
          .from('receipts')
          .update({
            disputed: true,
            dispute_reason: `Worker disputes amount. Poster claimed ${currency.symbol}${currentReceipt.amount}`,
            worker_confirmed: false
          })
          .eq('id', currentReceipt.id)
        if (disputeError) throw disputeError

        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .eq('is_admin', true)
        if (admins?.length > 0) {
          await supabase.from('notifications').insert(admins.map(admin => ({
            user_id: admin.id,
            title: 'Receipt Dispute',
            message: `Amount dispute on "${gig.title}". Poster claimed ${currency.symbol}${currentReceipt.amount}`,
            type: 'general',
            gig_id: gig.id,
            application_id: application?.id || null
          })))
        }
        await supabase.from('notifications').insert({
          user_id: gig.poster_id,
          title: 'Receipt Disputed',
          message: `The worker has disputed the amount for "${gig.title}". Our team will review and resolve this.`,
          type: 'general',
          gig_id: gig.id,
          application_id: application?.id || null
        })
        setStep('disputed')
        setSubmitting(false)
        return
      }

      const gigAmount = Number(currentReceipt.amount)
      const receiptCurrency = currentReceipt.currency || gig?.currency || 'NGN'
      let commissionAmount = calculateCommission(gigAmount)
      let alreadyCompleted = false

      if (!application?.id) {
        throw new Error('This job is missing its application record. Refresh and contact support if it continues.')
      }

      if (isWalletGig) {
        const referral = await getPendingGigReferralForPayout(gig.id, workerId)
        const { data: alreadyPaid, error: payoutError } = await supabase.rpc(
          'complete_wallet_gig_application',
          { p_application_id: application.id }
        )
        if (payoutError) throw payoutError
        alreadyCompleted = Boolean(alreadyPaid)

        if (!alreadyCompleted) {
          const referrerShare = referral ? gigAmount * 0.05 : 0
          const workerShare = calculateWorkerEscrowShare(gigAmount, Boolean(referral))
          if (referral) {
            await supabase.from('notifications').insert({
              user_id: referral.referrer_id,
              title: 'Gig Referral Reward!',
              message: `You earned ${gig.currency || 'NGN'} ${referrerShare.toLocaleString()} (5% of the gig payment) for referring this gig!`,
              type: 'wallet',
              gig_id: gig.id,
              application_id: application.id
            })
          }
        await supabase.from('notifications').insert([
            {
              user_id: gig.poster_id,
              title: 'Work Completed!',
              message: `The accepted work for "${gig.title}" is complete. Escrow has been released.`,
              type: 'review',
              gig_id: gig.id,
              application_id: application.id
            },
            {
              user_id: workerId,
              title: 'Escrow Released!',
              message: `${getCurrency(receiptCurrency).symbol}${workerShare.toLocaleString()} has been added to your wallet. Prima's commission and any referral reward have been accounted for.`,
              type: 'general',
              gig_id: gig.id,
              application_id: application.id
            }
          ])
        }
      } else {
        const { data: completion, error: completionError } = await supabase.rpc(
          'complete_manual_gig_application',
          { p_application_id: application.id }
        )
        if (completionError) throw completionError
        alreadyCompleted = Boolean(completion?.already_completed)
        commissionAmount = Number(completion?.commission_amount ?? commissionAmount)

        if (!alreadyCompleted) {
          await supabase.from('notifications').insert([
            {
              user_id: gig.poster_id,
              title: 'Work Completed!',
              message: `The accepted work for "${gig.title}" is complete. Please leave a review for the worker!`,
              type: 'review',
              gig_id: gig.id,
              application_id: application.id
            },
            {
              user_id: workerId,
              title: 'Gig Completed!',
              message: `"${gig.title}" complete! You owe ${getCurrency(receiptCurrency).symbol}${commissionAmount.toLocaleString()} platform commission. Pay within 3 days to keep applying for gigs.`,
              type: 'commission',
              gig_id: gig.id,
              application_id: application.id
            }
          ])
        }
      }

      try { await updateWorkerLevel(workerId) } catch (levelError) {
        console.error('Worker level refresh error:', levelError)
      }

      setStep('done')
      onComplete && onComplete()
    } catch (e) {
      setError('Error confirming receipt: ' + e.message)
    }
    setSubmitting(false)
  }

  const uploadReceipt = async (file) => {
    setUploading(true)
    try {
      const url = await uploadToR2(file, 'receipts')
      setReceiptFile(url)
    } catch (e) {
      console.log('Upload error:', e)
    }
    setUploading(false)
  }

  const confirmDisputePaymentReceived = async () => {
    setSubmitting(true)
    try {
      const currentReceipt = receipt || (application?.id
        ? (await supabase.from('receipts').select('*').eq('application_id', application.id).maybeSingle()).data
        : null)
      if (!currentReceipt) throw new Error('Receipt was not found')
      const { error: clearError } = await supabase.from('receipts')
        .update({ disputed: false, dispute_reason: null }).eq('id', currentReceipt.id)
      if (clearError) throw clearError
      await supabase.from('notifications').insert({
        user_id: gig.poster_id,
        title: 'Dispute Resolved',
        message: `The worker confirmed they received payment for "${gig.title}" and has closed the dispute.`,
        type: 'general', gig_id: gig.id, application_id: application?.id || null
      })
      await handleWorkerConfirm(true)
    } catch (e) {
      setError('Error resolving dispute: ' + e.message)
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--color-page)',
    border: '1.5px solid var(--color-border)', borderRadius: '12px',
    padding: '14px 16px', fontSize: '18px',
    color: 'var(--color-text)', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
    fontWeight: '700', textAlign: 'center'
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
        background: 'var(--color-surface)',
        borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        maxHeight: '92vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Handle */}
        <div style={{
          width: '40px', height: '4px',
          background: 'var(--color-border)', borderRadius: '2px',
          margin: '12px auto 0'
        }} />

        <div style={{ padding: '20px 24px 40px' }}>

          {/* LOADING */}
          {step === 'start' && (
            <div style={{
              textAlign: 'center', padding: '32px 20px',
              color: 'var(--color-text-subtle)', fontSize: '14px', fontWeight: '600'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
              Loading...
            </div>
          )}

          {/* POSTER AMOUNT STEP */}
          {step === 'poster_amount' && !isWalletGig && (
            <div>
              <div style={{
                fontSize: '12px', color: 'var(--color-brand)',
                fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '6px'
              }}>Receipt Confirmation</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '6px'
              }}>How much did you pay?</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                marginBottom: '24px', lineHeight: '1.6'
              }}>
                Enter the exact amount you paid the worker for "{gig?.title}"
              </div>

              {/* Currency Selector */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-text-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: '8px'
                }}>Currency Paid In</div>

                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowCurrencyPicker(s => !s)}
                    style={{
                      width: '100%', background: 'var(--color-page)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: '12px', padding: '12px 16px',
                      fontSize: '14px', fontWeight: '700',
                      color: 'var(--color-text)', cursor: 'default',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: '10px'
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>
                        {CURRENCIES.find(c => c.code === selectedCurrency)?.flag}
                      </span>
                      <span>
                        {selectedCurrency} —{' '}
                        {CURRENCIES.find(c => c.code === selectedCurrency)?.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>▼</span>
                  </button>

                  {showCurrencyPicker && (
                    <div style={{
                      position: 'absolute', top: '50px', left: 0, right: 0,
                      background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                      borderRadius: '14px', padding: '8px',
                      zIndex: 100, maxHeight: '250px', overflowY: 'auto',
                      boxShadow: '0 8px 32px rgba(108,71,255,0.15)'
                    }}>
                      {CURRENCIES.map(curr => (
                        <div
                          key={curr.code}
                          onClick={() => {
                            setSelectedCurrency(curr.code)
                            setShowCurrencyPicker(false)
                          }}
                          style={{
                            display: 'flex', gap: '10px',
                            alignItems: 'center', padding: '10px 12px',
                            borderRadius: '10px', cursor: 'pointer',
                            background: selectedCurrency === curr.code
                              ? 'var(--color-brand-soft)' : 'transparent'
                          }}
                          onMouseEnter={e =>
                            e.currentTarget.style.background = 'var(--color-page)'}
                          onMouseLeave={e =>
                            e.currentTarget.style.background =
                            selectedCurrency === curr.code ? 'var(--color-brand-soft)' : 'transparent'}
                        >
                          <span style={{ fontSize: '20px' }}>{curr.flag}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: '13px', fontWeight: '600',
                              color: selectedCurrency === curr.code ? 'var(--color-brand)' : 'var(--color-text)'
                            }}>{curr.code} — {curr.symbol}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{curr.name}</div>
                          </div>
                          {selectedCurrency === curr.code && (
                            <span style={{ color: 'var(--color-brand)' }}>✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Amount input */}
              <div style={{
                background: 'var(--color-page)', borderRadius: '16px',
                padding: '20px', marginBottom: '16px'
              }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-text-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: '10px',
                  textAlign: 'center'
                }}>Amount Paid</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    fontSize: '24px', fontWeight: '800',
                    color: 'var(--color-brand)', flexShrink: 0
                  }}>
                    {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol || '$'}
                  </div>
                  <input
                    type="number"
                    value={amount}
                    min={gig?.pay_min || 0}
                    onChange={e => {
                      setAmount(e.target.value)
                      setError(null)
                    }}
                    placeholder="0"
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--color-brand-border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                {gig?.pay_min && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-subtle)',
                      marginTop: '8px',
                      textAlign: 'center'
                    }}
                  >
                    Minimum: {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}
                    {gig.pay_min} · You can enter more if you paid extra
                  </div>
                )}

                {/* Commission preview */}
                {amount && parseFloat(amount) > 0 && (
                  <div style={{
                    marginTop: '14px', padding: '12px',
                    background: 'var(--color-surface)', borderRadius: '10px',
                    border: '1px solid var(--color-border)'
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', marginBottom: '6px'
                    }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Amount paid</span>
                      <span style={{ fontWeight: '700', color: 'var(--color-text)' }}>
                        {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}
                        {parseFloat(amount).toLocaleString()} {selectedCurrency}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', paddingTop: '6px',
                      borderTop: '1px solid var(--color-page)'
                    }}>
                      <span style={{ color: 'var(--color-warning)' }}>
                        {isWorker
                          ? `Total fee (${hasReferral ? '15%' : '10%'})`
                          : 'Prima fee (10%; referral reward may apply)'}
                      </span>
                      <span style={{ fontWeight: '800', color: 'var(--color-warning)' }}>
                        {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}
                        {calculateCommission(parseFloat(amount), hasReferral).toLocaleString()} {selectedCurrency}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Receipt upload (optional) */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-text-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: '8px'
                }}>Payment Proof {!isWalletGig && <span style={{ color: 'var(--color-danger)' }}>*Required</span>}</div>
                <div
                  onClick={() => document.getElementById('receipt-upload').click()}
                  style={{
                    background: receiptFile ? 'var(--color-success-soft)' : 'var(--color-page)',
                    border: `2px dashed ${receiptFile ? 'var(--color-success-border)' : 'var(--color-brand-border-strong)'}`,
                    borderRadius: '12px', padding: '16px',
                    textAlign: 'center', cursor: 'pointer'
                  }}>
                  {receiptFile ? (
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-success)'
                    }}>✓ Receipt uploaded</div>
                  ) : (
                    <>
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>
                        {uploading ? '⏳' : '📸'}
                      </div>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-brand)',
                        fontWeight: '600'
                      }}>
                        {uploading ? 'Uploading...' : 'Upload bank screenshot'}
                      </div>
                    </>
                  )}
                  <input
                    id="receipt-upload"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files[0]) uploadReceipt(e.target.files[0])
                    }}
                  />
                </div>
              </div>

              {error && (
                <div style={{
                  background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: 'var(--color-danger)',
                  marginBottom: '14px'
                }}>{error}</div>
              )}

              {(() => {
                const isBlocked = (!isWalletGig && (!amount || parseFloat(amount) <= 0)) ||
                  (!isWalletGig && !receiptFile) || submitting
                return (
                  <button
                    onClick={handlePosterSubmit}
                    disabled={isBlocked}
                    style={{
                      width: '100%',
                      background: isBlocked ? 'var(--color-border)' : 'var(--color-brand-gradient)',
                      border: 'none', borderRadius: '14px', padding: '16px',
                      fontSize: '15px', fontWeight: '700',
                      color: isBlocked ? 'var(--color-text-subtle)' : 'var(--color-surface)',
                      cursor: isBlocked ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: !isBlocked ? '0 4px 20px rgba(108,71,255,0.35)' : 'none'
                    }}>
                    {submitting ? '⏳ Submitting...' : '✓ Confirm Payment'}
                  </button>
                )
              })()}
              {!isWalletGig && !receiptFile && (
                <div style={{
                  fontSize: '12px', color: 'var(--color-warning)', textAlign: 'center',
                  marginTop: '8px'
                }}>Please upload payment proof before confirming</div>
              )}
            </div>
          )}

          {step === 'poster_amount' && isWalletGig && (
            <div>
              <div style={{
                fontSize: '12px', color: 'var(--color-success)',
                fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '6px'
              }}>Escrow Release</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '6px'
              }}>Mark this gig as done?</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                marginBottom: '24px', lineHeight: '1.6'
              }}>
                Funds are already secured in escrow for "{gig?.title}". Confirming will notify the worker to release payment.
              </div>

              <div style={{
                background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                borderRadius: '16px', padding: '24px',
                textAlign: 'center', color: 'var(--color-surface)',
                marginBottom: '20px'
              }}>
                <div style={{
                  fontSize: '12px', opacity: 0.85,
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '8px'
                }}>Amount in Escrow</div>
                <div style={{
                  fontSize: '40px', fontWeight: '800',
                  letterSpacing: '-2px', marginBottom: '4px'
                }}>
                  {getCurrency(gig?.currency || 'USD').symbol}{Number(gig?.escrow_amount || gig?.pay_min || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>{gig?.currency || 'USD'}</div>
              </div>

              {error && (
                <div style={{
                  background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: 'var(--color-danger)',
                  marginBottom: '14px'
                }}>{error}</div>
              )}

              <button
                onClick={handlePosterSubmit}
                disabled={submitting}
                style={{
                  width: '100%',
                  background: submitting ? 'var(--color-brand-border-strong)' : 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                  border: 'none', borderRadius: '14px', padding: '16px',
                  fontSize: '15px', fontWeight: '700', color: 'var(--color-surface)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: submitting ? 'none' : '0 4px 20px rgba(0,196,140,0.35)'
                }}>
                {submitting ? '⏳ Submitting...' : '✓ Mark Done →'}
              </button>
            </div>
          )}

          {/* WAITING FOR WORKER */}
          {step === 'waiting_worker' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>⏳</div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '8px'
              }}>Waiting for Worker</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                lineHeight: '1.7', marginBottom: '20px'
              }}>
                You confirmed payment of {getCurrency(receipt?.currency || gig?.currency || 'USD').symbol}{receipt?.amount?.toLocaleString()}.
                Waiting for the worker to confirm they received this amount.
              </div>
              <div style={{
                background: 'var(--color-page)', borderRadius: '14px',
                padding: '14px', fontSize: '12px',
                color: 'var(--color-brand)', lineHeight: '1.6'
              }}>
                The worker will be notified to confirm the receipt.
                You'll get notified once they confirm.
              </div>
            </div>
          )}

          {/* WAITING FOR POSTER */}
          {step === 'waiting_poster' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>⏳</div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '8px'
              }}>Waiting for Poster</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                lineHeight: '1.7'
              }}>
                The poster needs to confirm the payment amount first.
                You'll be notified when they do.
              </div>
            </div>
          )}

          {/* WORKER CONFIRM STEP */}
          {step === 'worker_confirm' && (
            <div>
              <div style={{
                fontSize: '12px', color: 'var(--color-brand)',
                fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '6px'
              }}>Confirm Receipt</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '6px'
              }}>Did you receive this amount?</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                marginBottom: '24px'
              }}>
                The poster confirmed they paid for "{gig?.title}"
              </div>

              {/* Amount display */}
              <div style={{
                background: 'var(--color-brand-gradient)',
                borderRadius: '16px', padding: '24px',
                textAlign: 'center', color: 'var(--color-surface)',
                marginBottom: '20px'
              }}>
                <div style={{
                  fontSize: '12px', opacity: 0.8,
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '8px'
                }}>Poster confirmed payment of</div>
                {(() => {
                  const rc = getCurrency(receipt?.currency || gig?.currency || 'USD')
                  return (
                    <>
                      <div style={{
                        fontSize: '40px', fontWeight: '800',
                        letterSpacing: '-2px', marginBottom: '4px'
                      }}>
                        {rc.symbol}{receipt?.amount?.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.7 }}>
                        {receipt?.currency || gig?.currency || 'USD'}
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Commission notice */}
              {(() => {
                const rc = getCurrency(receipt?.currency || gig?.currency || 'USD')
                const commissionAmt = calculateCommission(
                  receipt?.amount || 0, hasReferral
                )
                return (
                  <div style={{
                    background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)',
                    borderRadius: '12px', padding: '14px',
                    marginBottom: '20px',
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>💰</span>
                    <div>
                      <div style={{
                        fontSize: '13px', fontWeight: '700',
                        color: 'var(--color-warning)', marginBottom: '3px'
                      }}>Platform Commission</div>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-warning)',
                        opacity: 0.8, lineHeight: '1.5'
                      }}>
                        Confirming means you agree to a total {hasReferral ? '15%' : '10%'} fee
                        of {rc.symbol}{commissionAmt.toLocaleString()} payable to Prima.
                        {hasReferral ? ' Prima pays 5% of it to your referrer.' : ''}
                        You have 3 days to pay.
                      </div>
                    </div>
                  </div>
                )
              })()}

              {error && (
                <div style={{
                  background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: 'var(--color-danger)',
                  marginBottom: '14px'
                }}>{error}</div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleWorkerConfirm(false)}
                  disabled={submitting}
                  style={{
                    flex: 1, background: 'var(--color-danger-soft)',
                    border: '1.5px solid var(--color-danger-border)',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '700',
                    color: 'var(--color-danger)', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>
                  ✗ Dispute Amount
                </button>
                <button
                  onClick={() => handleWorkerConfirm(true)}
                  disabled={submitting}
                  style={{
                    flex: 2,
                    background: submitting
                      ? 'var(--color-brand-border-strong)'
                      : 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                    border: 'none', borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: submitting
                      ? 'none' : '0 4px 20px rgba(0,196,140,0.35)'
                  }}>
                  {submitting ? '⏳...' : '✓ Yes, I Received It'}
                </button>
              </div>
            </div>
          )}

          {/* DISPUTED */}
          {step === 'disputed' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>⚠️</div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '8px'
              }}>Amount Disputed</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                lineHeight: '1.7', marginBottom: '20px'
              }}>
                {isWorker
                  ? 'You raised a dispute on this payment. If you\'ve since found the payment, you can confirm it below — otherwise our team will review within 24 hours.'
                  : 'The worker has disputed the payment amount. Our team will review and resolve this within 24 hours. Both parties will be notified of the outcome.'
                }
              </div>
              <div style={{
                background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)',
                borderRadius: '12px', padding: '14px',
                fontSize: '12px', color: 'var(--color-warning)', lineHeight: '1.6',
                marginBottom: isWorker ? '20px' : '0'
              }}>
                In the meantime please have your payment proof ready.
                Our admin team may contact you for more information.
              </div>

              {/* Worker can self-resolve if they found the payment */}
              {isWorker && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <div style={{
                    background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                    borderRadius: '12px', padding: '12px 14px',
                    fontSize: '12px', color: 'var(--color-brand)', lineHeight: '1.5',
                    textAlign: 'left'
                  }}>
                    💡 Found the payment? Tap below to confirm and close this dispute without waiting for admin.
                  </div>
                  <button
                    onClick={async () => {
                      setConfirmDialog({
                        title: 'Confirm that you received the payment?',
                        message: 'This closes the dispute and confirms that the payment for this job reached you.',
                        confirmLabel: 'Yes, payment received',
                        action: confirmDisputePaymentReceived
                      })
                    }}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      background: submitting ? 'var(--color-brand-border-strong)' : 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                      border: 'none', borderRadius: '12px', padding: '14px',
                      fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: submitting ? 'none' : '0 4px 16px rgba(0,196,140,0.35)'
                    }}>
                    {submitting ? '⏳ Processing...' : '✓ I Found It — Confirm Payment'}
                  </button>
                </div>
              )}

              {error && (
                <div style={{
                  background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: 'var(--color-danger)', marginTop: '12px'
                }}>{error}</div>
              )}
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
              <div style={{
                fontSize: '24px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '8px'
              }}>Gig Complete!</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                lineHeight: '1.7', marginBottom: '20px'
              }}>
                Both parties have confirmed the receipt.
                The gig is now complete!
              </div>

              {isWorker && receipt?.commission_amount && (
                <div style={{
                  background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)',
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '16px', textAlign: 'left'
                }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700',
                    color: 'var(--color-warning)', marginBottom: '6px'
                  }}>💰 Commission Due</div>
                  <div style={{
                    fontSize: '22px', fontWeight: '800',
                    color: 'var(--color-warning)', marginBottom: '4px'
                  }}>
                    {getCurrency(receipt?.currency || gig?.currency || 'USD').symbol}{receipt.commission_amount.toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-warning)',
                    opacity: 0.8, lineHeight: '1.5'
                  }}>
                    {hasReferral ? '15% total fee (including the 5% referral reward)' : '10% platform fee'} due within 3 days.
                    Pay via Fincra or Prima Credits to keep applying
                    for gigs.
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      window.dispatchEvent(
                        new CustomEvent('navigateTo', { detail: 'commission' })
                      )
                    }}
                    style={{
                      width: '100%', marginTop: '12px',
                      background: 'linear-gradient(135deg, var(--color-warning), var(--color-brand-highlight))',
                      border: 'none', borderRadius: '10px',
                      padding: '12px', fontSize: '13px',
                      fontWeight: '700', color: 'var(--color-surface)',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>
                    Pay Commission Now →
                  </button>
                </div>
              )}

              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  background: 'var(--color-brand-gradient)',
                  border: 'none', borderRadius: '14px', padding: '16px',
                  fontSize: '15px', fontWeight: '700', color: 'var(--color-surface)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
                }}>
                ✓ Done
              </button>
            </div>
          )}
        </div>

        {confirmDialog && (
          <ConfirmDialog
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel={confirmDialog.confirmLabel}
            onCancel={() => setConfirmDialog(null)}
            onConfirm={() => { const action = confirmDialog.action; setConfirmDialog(null); action() }}
          />
        )}
        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}
