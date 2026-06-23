import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { CURRENCIES, getCurrency } from '../data/currencies'
import { rewardGigReferral } from '../utils/referral'
import { calculateCommission, calculateWorkerEscrowShare, PAYMENT_METHODS } from '../utils/payments'

export default function ReceiptFlow({ gig, onClose, onComplete }) {
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

  const isPoster = gig?.poster_id === user?.id
  const isWorker = gig?.worker_id === user?.id
  const currency = getCurrency(gig?.currency || 'NGN')
  const isWalletGig = gig?.payment_method === PAYMENT_METHODS.WALLET

  const fetchReceipt = useCallback(async () => {
    if (!gig) return
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('gig_id', gig.id)
      .maybeSingle()
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
  }, [gig, isPoster, isWorker])

  useEffect(() => {
    const timer = setTimeout(fetchReceipt, 0)
    return () => clearTimeout(timer)
  }, [fetchReceipt])

  const updateWorkerLevel = async (workerId) => {
    const { data: workerData } = await supabase
      .from('users').select('gigs_completed').eq('id', workerId).single()
    const count = workerData?.gigs_completed || 0
    let level = 'new'
    let level_progress = Math.floor((count / 3) * 100)
    if (count >= 25) { level = 'elite'; level_progress = 100 }
    else if (count >= 10) { level = 'pro'; level_progress = Math.floor(((count - 10) / 15) * 100) }
    else if (count >= 3) { level = 'rising'; level_progress = Math.floor(((count - 3) / 7) * 100) }
    await supabase.from('users').update({ level, level_progress }).eq('id', workerId)
  }

  const handlePosterSubmit = async () => {
    const walletAmount = Number(gig?.escrow_amount || gig?.pay_min || 0)
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

      // Check if receipt exists
      const { data: existing } = await supabase
        .from('receipts')
        .select('id')
        .eq('gig_id', gig.id)
        .maybeSingle()

      if (existing) {
        await supabase
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
      } else {
        await supabase.from('receipts').insert({
          gig_id: gig.id,
          poster_id: gig.poster_id,
          worker_id: gig.worker_id,
          amount: gigAmount,
          currency: receiptCurrency,
          commission_amount: commissionAmount,
          poster_confirmed: true,
          poster_confirmed_at: new Date().toISOString(),
          worker_confirmed: false,
          completed: false,
          poster_receipt_url: isWalletGig ? null : (receiptFile || null),
        })
      }

      // Notify worker with currency info
      const currSymbol = CURRENCIES.find(c => c.code === receiptCurrency)?.symbol
      await supabase.from('notifications').insert({
        user_id: gig.worker_id,
        title: '📎 Receipt Submitted',
        message: isWalletGig
          ? `Poster marked "${gig.title}" complete. Please confirm so escrow can release.`
          : `Poster confirmed payment of ${currSymbol}${gigAmount.toLocaleString()} ${receiptCurrency} for "${gig.title}". Please confirm you received this amount.`,
        type: 'receipt',
        gig_id: gig.id
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
      const { data: currentReceipt } = await supabase
        .from('receipts')
        .select('*')
        .eq('gig_id', gig.id)
        .single()

      if (!agreed) {
        // Worker disputes the amount
        await supabase
          .from('receipts')
          .update({
            disputed: true,
            dispute_reason: `Worker disputes amount. Poster claimed ${currency.symbol}${currentReceipt.amount}`,
            worker_confirmed: false
          })
          .eq('id', currentReceipt.id)

        // Notify admin
        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .eq('is_admin', true)

        if (admins?.length > 0) {
          await supabase.from('notifications').insert(
            admins.map(admin => ({
              user_id: admin.id,
              title: '⚠️ Receipt Dispute',
              message: `Amount dispute on "${gig.title}". Poster claimed ${currency.symbol}${currentReceipt.amount}`,
              type: 'general',
              gig_id: gig.id
            }))
          )
        }

        // Notify poster
        await supabase.from('notifications').insert({
          user_id: gig.poster_id,
          title: '⚠️ Receipt Disputed',
          message: `The worker has disputed the amount for "${gig.title}". Our team will review and resolve this.`,
          type: 'general',
          gig_id: gig.id
        })

        setStep('disputed')
        setSubmitting(false)
        return
      }

      // Worker agrees — complete the receipt
      const gigAmount = currentReceipt.amount
      const receiptCurrency = currentReceipt.currency || gig?.currency || 'NGN'
      const commissionAmount = calculateCommission(gigAmount)

      await supabase
        .from('receipts')
        .update({
          worker_confirmed: true,
          worker_confirmed_at: new Date().toISOString(),
          completed: true,
          completed_at: new Date().toISOString(),
          status: 'completed',
          commission_amount: commissionAmount
        })
        .eq('id', currentReceipt.id)

      if (isWalletGig) {
        const escrowAmount = Number(gig.escrow_amount || gigAmount)
        const { error: releaseError } = await supabase.rpc('release_gig_escrow', {
          p_gig_id: gig.id,
          p_poster_id: gig.poster_id,
          p_worker_id: gig.worker_id,
          p_amount: escrowAmount
        })

        if (releaseError) throw releaseError

        const workerShare = calculateWorkerEscrowShare(escrowAmount)

        if (gigAmount > 0) {
          await rewardGigReferral(gig.id, gigAmount, gig.currency || 'NGN')
        }

        await supabase.rpc('increment_gigs_completed', {
          worker_id: gig.worker_id
        })

        await updateWorkerLevel(gig.worker_id)

        await supabase.from('notifications').insert([
          {
            user_id: gig.poster_id,
            title: '✅ Gig Completed!',
            message: `"${gig.title}" is complete. Escrow has been released.`,
            type: 'review',
            gig_id: gig.id
          },
          {
            user_id: gig.worker_id,
            title: '✅ Escrow Released!',
            message: `${getCurrency(receiptCurrency).symbol}${workerShare.toLocaleString()} has been added to your wallet. Prima's 10% commission was already deducted.`,
            type: 'general',
            gig_id: gig.id
          }
        ])

        setStep('done')
        onComplete && onComplete()
        setSubmitting(false)
        return
      }

      // Create or refresh one commission record for this gig/worker.
      const commissionPayload = {
        gig_id: gig.id,
        worker_id: gig.worker_id,
        gig_amount: gigAmount,
        commission_amount: commissionAmount,
        currency: receiptCurrency,
        status: 'pending',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      }

      const { data: existingCommission } = await supabase
        .from('commissions')
        .select('id, status')
        .eq('gig_id', gig.id)
        .eq('worker_id', gig.worker_id)
        .maybeSingle()

      if (existingCommission) {
        if (existingCommission.status !== 'paid') {
          await supabase
            .from('commissions')
            .update(commissionPayload)
            .eq('id', existingCommission.id)
        }
      } else {
        await supabase.from('commissions').insert(commissionPayload)
      }

      // Reward gig referral if applicable
      if (gigAmount > 0) {
        await rewardGigReferral(gig.id, gigAmount, gig.currency || 'NGN')
      }

      // Update worker gigs completed
      await supabase.rpc('increment_gigs_completed', {
        worker_id: gig.worker_id
      })

      await updateWorkerLevel(gig.worker_id)

      // Notify both parties
      await supabase.from('notifications').insert([
        {
          user_id: gig.poster_id,
          title: '✅ Gig Completed!',
          message: `"${gig.title}" is complete. Please leave a review for the worker!`,
          type: 'review',
          gig_id: gig.id
        },
        {
          user_id: gig.worker_id,
          title: '✅ Gig Completed!',
          message: `"${gig.title}" complete! You owe ${getCurrency(receiptCurrency).symbol}${commissionAmount.toLocaleString()} platform commission. Pay within 3 days to keep applying for gigs.`,
          type: 'commission',
          gig_id: gig.id
        }
      ])

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
      const ext = file.name.split('.').pop()
      const name = `receipt-${gig.id}-${user.id}-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('receipts')
        .upload(name, file, { upsert: true })
      if (!error) {
        const { data } = supabase.storage
          .from('receipts')
          .getPublicUrl(name)
        setReceiptFile(data.publicUrl)
      }
    } catch (e) {
      console.log('Upload error:', e)
    }
    setUploading(false)
  }

  const inputStyle = {
    width: '100%', background: '#F5F4FF',
    border: '1.5px solid #E2E0FF', borderRadius: '12px',
    padding: '14px 16px', fontSize: '18px',
    color: '#14123A', fontFamily: 'inherit',
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
        background: '#fff',
        borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        maxHeight: '92vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Handle */}
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '12px auto 0'
        }} />

        <div style={{ padding: '20px 24px 40px' }}>

          {/* LOADING */}
          {step === 'start' && (
            <div style={{
              textAlign: 'center', padding: '32px 20px',
              color: '#A09DC8', fontSize: '14px', fontWeight: '600'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
              Loading...
            </div>
          )}

          {/* POSTER AMOUNT STEP */}
          {step === 'poster_amount' && !isWalletGig && (
            <div>
              <div style={{
                fontSize: '10px', color: '#6C47FF',
                fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '6px'
              }}>Receipt Confirmation</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: '#14123A', marginBottom: '6px'
              }}>How much did you pay?</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                marginBottom: '24px', lineHeight: '1.6'
              }}>
                Enter the exact amount you paid the worker for "{gig?.title}"
              </div>

              {/* Currency Selector */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700',
                  color: '#A09DC8', textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: '8px'
                }}>Currency Paid In</div>

                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowCurrencyPicker(s => !s)}
                    style={{
                      width: '100%', background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF',
                      borderRadius: '12px', padding: '12px 16px',
                      fontSize: '14px', fontWeight: '700',
                      color: '#14123A', cursor: 'default',
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
                    <span style={{ fontSize: '12px', color: '#A09DC8' }}>▼</span>
                  </button>

                  {showCurrencyPicker && (
                    <div style={{
                      position: 'absolute', top: '50px', left: 0, right: 0,
                      background: '#fff', border: '1.5px solid #E2E0FF',
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
                              ? '#EEE9FF' : 'transparent'
                          }}
                          onMouseEnter={e =>
                            e.currentTarget.style.background = '#F5F4FF'}
                          onMouseLeave={e =>
                            e.currentTarget.style.background =
                            selectedCurrency === curr.code ? '#EEE9FF' : 'transparent'}
                        >
                          <span style={{ fontSize: '20px' }}>{curr.flag}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: '13px', fontWeight: '600',
                              color: selectedCurrency === curr.code ? '#6C47FF' : '#14123A'
                            }}>{curr.code} — {curr.symbol}</div>
                            <div style={{ fontSize: '10px', color: '#A09DC8' }}>{curr.name}</div>
                          </div>
                          {selectedCurrency === curr.code && (
                            <span style={{ color: '#6C47FF' }}>✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Amount input */}
              <div style={{
                background: '#F5F4FF', borderRadius: '16px',
                padding: '20px', marginBottom: '16px'
              }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700',
                  color: '#A09DC8', textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: '10px',
                  textAlign: 'center'
                }}>Amount Paid</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    fontSize: '24px', fontWeight: '800',
                    color: '#6C47FF', flexShrink: 0
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
                    onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                    onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  />
                </div>

                {gig?.pay_min && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#A09DC8',
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
                    background: '#fff', borderRadius: '10px',
                    border: '1px solid #E2E0FF'
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', marginBottom: '6px'
                    }}>
                      <span style={{ color: '#8B8FAF' }}>Amount paid</span>
                      <span style={{ fontWeight: '700', color: '#14123A' }}>
                        {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}
                        {parseFloat(amount).toLocaleString()} {selectedCurrency}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', paddingTop: '6px',
                      borderTop: '1px solid #F5F4FF'
                    }}>
                      <span style={{ color: '#FF6B2B' }}>
                        Platform commission debt (10%)
                      </span>
                      <span style={{ fontWeight: '800', color: '#FF6B2B' }}>
                        {CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}
                        {calculateCommission(parseFloat(amount)).toLocaleString()} {selectedCurrency}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Receipt upload (optional) */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700',
                  color: '#A09DC8', textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: '8px'
                }}>Payment Proof {!isWalletGig && <span style={{ color: '#FF3366' }}>*Required</span>}</div>
                <div
                  onClick={() => document.getElementById('receipt-upload').click()}
                  style={{
                    background: receiptFile ? '#DFFDF4' : '#F5F4FF',
                    border: `2px dashed ${receiptFile ? '#7EECD2' : '#B8A5FF'}`,
                    borderRadius: '12px', padding: '16px',
                    textAlign: 'center', cursor: 'pointer'
                  }}>
                  {receiptFile ? (
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: '#00C48C'
                    }}>✓ Receipt uploaded</div>
                  ) : (
                    <>
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>
                        {uploading ? '⏳' : '📸'}
                      </div>
                      <div style={{
                        fontSize: '12px', color: '#6C47FF',
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
                  background: '#FFE8EE', border: '1.5px solid #FF99B3',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: '#FF3366',
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
                      background: isBlocked ? '#E2E0FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                      border: 'none', borderRadius: '14px', padding: '16px',
                      fontSize: '15px', fontWeight: '700',
                      color: isBlocked ? '#A09DC8' : '#fff',
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
                  fontSize: '11px', color: '#FF6B2B', textAlign: 'center',
                  marginTop: '8px'
                }}>Please upload payment proof before confirming</div>
              )}
            </div>
          )}

          {step === 'poster_amount' && isWalletGig && (
            <div>
              <div style={{
                fontSize: '10px', color: '#00A878',
                fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '6px'
              }}>Escrow Release</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: '#14123A', marginBottom: '6px'
              }}>Mark this gig as done?</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                marginBottom: '24px', lineHeight: '1.6'
              }}>
                Funds are already secured in escrow for "{gig?.title}". Confirming will notify the worker to release payment.
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #00C48C, #00A878)',
                borderRadius: '16px', padding: '24px',
                textAlign: 'center', color: '#fff',
                marginBottom: '20px'
              }}>
                <div style={{
                  fontSize: '11px', opacity: 0.85,
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
                  background: '#FFE8EE', border: '1.5px solid #FF99B3',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: '#FF3366',
                  marginBottom: '14px'
                }}>{error}</div>
              )}

              <button
                onClick={handlePosterSubmit}
                disabled={submitting}
                style={{
                  width: '100%',
                  background: submitting ? '#B8A5FF' : 'linear-gradient(135deg, #00C48C, #00A878)',
                  border: 'none', borderRadius: '14px', padding: '16px',
                  fontSize: '15px', fontWeight: '700', color: '#fff',
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
                color: '#14123A', marginBottom: '8px'
              }}>Waiting for Worker</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                lineHeight: '1.7', marginBottom: '20px'
              }}>
                You confirmed payment of {getCurrency(receipt?.currency || gig?.currency || 'USD').symbol}{receipt?.amount?.toLocaleString()}.
                Waiting for the worker to confirm they received this amount.
              </div>
              <div style={{
                background: '#F5F4FF', borderRadius: '14px',
                padding: '14px', fontSize: '12px',
                color: '#6C47FF', lineHeight: '1.6'
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
                color: '#14123A', marginBottom: '8px'
              }}>Waiting for Poster</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
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
                fontSize: '10px', color: '#6C47FF',
                fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '6px'
              }}>Confirm Receipt</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: '#14123A', marginBottom: '6px'
              }}>Did you receive this amount?</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                marginBottom: '24px'
              }}>
                The poster confirmed they paid for "{gig?.title}"
              </div>

              {/* Amount display */}
              <div style={{
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                borderRadius: '16px', padding: '24px',
                textAlign: 'center', color: '#fff',
                marginBottom: '20px'
              }}>
                <div style={{
                  fontSize: '11px', opacity: 0.8,
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
                  receipt?.amount || 0, receipt?.currency || gig?.currency
                )
                return (
                  <div style={{
                    background: '#FFF0E8', border: '1.5px solid #FFBC99',
                    borderRadius: '12px', padding: '14px',
                    marginBottom: '20px',
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                  }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>💰</span>
                    <div>
                      <div style={{
                        fontSize: '13px', fontWeight: '700',
                        color: '#FF6B2B', marginBottom: '3px'
                      }}>Platform Commission</div>
                      <div style={{
                        fontSize: '12px', color: '#FF6B2B',
                        opacity: 0.8, lineHeight: '1.5'
                      }}>
                        Confirming this receipt means you agree a 10% platform
                        commission of {rc.symbol}{commissionAmt.toLocaleString()} will be owed to Prima.
                        You have 3 days to pay.
                      </div>
                    </div>
                  </div>
                )
              })()}

              {error && (
                <div style={{
                  background: '#FFE8EE', border: '1.5px solid #FF99B3',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: '#FF3366',
                  marginBottom: '14px'
                }}>{error}</div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleWorkerConfirm(false)}
                  disabled={submitting}
                  style={{
                    flex: 1, background: '#FFE8EE',
                    border: '1.5px solid #FF99B3',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '700',
                    color: '#FF3366', cursor: 'pointer',
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
                      ? '#B8A5FF'
                      : 'linear-gradient(135deg, #00C48C, #00A878)',
                    border: 'none', borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '700', color: '#fff',
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
                color: '#14123A', marginBottom: '8px'
              }}>Amount Disputed</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                lineHeight: '1.7', marginBottom: '20px'
              }}>
                {isWorker
                  ? 'You raised a dispute on this payment. If you\'ve since found the payment, you can confirm it below — otherwise our team will review within 24 hours.'
                  : 'The worker has disputed the payment amount. Our team will review and resolve this within 24 hours. Both parties will be notified of the outcome.'
                }
              </div>
              <div style={{
                background: '#FFF0E8', border: '1.5px solid #FFBC99',
                borderRadius: '12px', padding: '14px',
                fontSize: '12px', color: '#FF6B2B', lineHeight: '1.6',
                marginBottom: isWorker ? '20px' : '0'
              }}>
                In the meantime please have your payment proof ready.
                Our admin team may contact you for more information.
              </div>

              {/* Worker can self-resolve if they found the payment */}
              {isWorker && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <div style={{
                    background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                    borderRadius: '12px', padding: '12px 14px',
                    fontSize: '12px', color: '#6C47FF', lineHeight: '1.5',
                    textAlign: 'left'
                  }}>
                    💡 Found the payment? Tap below to confirm and close this dispute without waiting for admin.
                  </div>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Are you sure you received the payment and want to close this dispute?')) return
                      setSubmitting(true)
                      try {
                        const { data: currentReceipt } = await supabase
                          .from('receipts')
                          .select('*')
                          .eq('gig_id', gig.id)
                          .single()

                        await supabase
                          .from('receipts')
                          .update({ disputed: false, dispute_reason: null })
                          .eq('id', currentReceipt.id)

                        // Notify poster dispute is resolved
                        await supabase.from('notifications').insert({
                          user_id: gig.poster_id,
                          title: '✅ Dispute Resolved',
                          message: `The worker confirmed they received payment for "${gig.title}" and has closed the dispute.`,
                          type: 'general',
                          gig_id: gig.id
                        })

                        // Proceed with full confirmation
                        await handleWorkerConfirm(true)
                      } catch (e) {
                        setError('Error resolving dispute: ' + e.message)
                        setSubmitting(false)
                      }
                    }}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      background: submitting ? '#B8A5FF' : 'linear-gradient(135deg, #00C48C, #00A878)',
                      border: 'none', borderRadius: '12px', padding: '14px',
                      fontSize: '14px', fontWeight: '700', color: '#fff',
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
                  background: '#FFE8EE', border: '1.5px solid #FF99B3',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: '#FF3366', marginTop: '12px'
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
                color: '#14123A', marginBottom: '8px'
              }}>Gig Complete!</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                lineHeight: '1.7', marginBottom: '20px'
              }}>
                Both parties have confirmed the receipt.
                The gig is now complete!
              </div>

              {isWorker && receipt?.commission_amount && (
                <div style={{
                  background: '#FFF0E8', border: '1.5px solid #FFBC99',
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '16px', textAlign: 'left'
                }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700',
                    color: '#FF6B2B', marginBottom: '6px'
                  }}>💰 Commission Due</div>
                  <div style={{
                    fontSize: '22px', fontWeight: '800',
                    color: '#FF6B2B', marginBottom: '4px'
                  }}>
                    {getCurrency(receipt?.currency || gig?.currency || 'USD').symbol}{receipt.commission_amount.toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: '11px', color: '#FF6B2B',
                    opacity: 0.8, lineHeight: '1.5'
                  }}>
                    10% platform fee due within 3 days.
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
                      background: 'linear-gradient(135deg, #FF6B2B, #FF4DCF)',
                      border: 'none', borderRadius: '10px',
                      padding: '12px', fontSize: '13px',
                      fontWeight: '700', color: '#fff',
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
                  background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  border: 'none', borderRadius: '14px', padding: '16px',
                  fontSize: '15px', fontWeight: '700', color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
                }}>
                ✓ Done
              </button>
            </div>
          )}
        </div>

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
