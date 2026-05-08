import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { playComplete, playReceipt } from '../utils/sounds'

export default function ReceiptFlow({ gig, userRole, workerId, onClose, onComplete }) {
  // userRole = 'poster' or 'worker'
  // workerId  = the specific worker this receipt belongs to
  const { user } = useAuth()
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState('upload') // upload | review | confirm | done | dispute
  const fileRef = useRef()

  const targetWorkerId = workerId || user.id

  useEffect(() => {
    fetchReceipt()
    const channel = supabase
      .channel(`receipt-${gig.id}-${targetWorkerId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'receipts',
        filter: `gig_id=eq.${gig.id}`
      }, () => fetchReceipt())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [gig.id, targetWorkerId])

  const fetchReceipt = async () => {
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('gig_id', gig.id)
      .eq('worker_id', targetWorkerId)
      .maybeSingle()
    if (data) {
      setReceipt(data)
      // Determine step
      if (data.completed) {
        setStep('done')
      } else if (data.disputed) {
        setStep('dispute')
      } else if (
        (userRole === 'poster' && data.poster_receipt_url) ||
        (userRole === 'worker' && data.worker_receipt_url)
      ) {
        setStep('review')
      } else {
        setStep('upload')
      }
    }
    setLoading(false)
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const fileName = `${gig.id}-${targetWorkerId}-${userRole}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(fileName)

    // Create or update receipt record
    const existing = receipt
    if (existing) {
      const updateData = userRole === 'poster'
        ? { poster_receipt_url: urlData.publicUrl, amount: parseFloat(amount) || existing.amount, notes }
        : { worker_receipt_url: urlData.publicUrl, amount: parseFloat(amount) || existing.amount, notes }

      await supabase
        .from('receipts')
        .update(updateData)
        .eq('id', existing.id)
    } else {
      const insertData = {
        gig_id: gig.id,
        poster_id: gig.poster_id,
        worker_id: targetWorkerId,
        amount: parseFloat(amount) || 0,
        notes,
        status: 'pending'
      }
      if (userRole === 'poster') {
        insertData.poster_receipt_url = urlData.publicUrl
      } else {
        insertData.worker_receipt_url = urlData.publicUrl
      }
      await supabase.from('receipts').insert(insertData)
    }

    // Notify other party
    const otherUserId = userRole === 'poster' ? receipt?.worker_id : gig.poster_id
    if (otherUserId) {
      await supabase.from('notifications').insert({
        user_id: otherUserId,
        title: 'Receipt Uploaded!',
        message: `${userRole === 'poster' ? 'Client' : 'Worker'} uploaded a receipt for "${gig.title}". Please review and confirm.`,
        type: 'receipt',
        gig_id: gig.id
      })
    }

    playReceipt()
    setUploading(false)
    await fetchReceipt()
    setStep('review')
  }

  const handleConfirm = async () => {
    if (!receipt) return
    setConfirming(true)

    const updateData = userRole === 'poster'
      ? { poster_confirmed: true, poster_confirmed_at: new Date().toISOString() }
      : { worker_confirmed: true, worker_confirmed_at: new Date().toISOString() }

    await supabase
      .from('receipts')
      .update(updateData)
      .eq('id', receipt.id)

    // Check if both confirmed
    const { data: updated } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receipt.id)
      .single()

    if (updated.poster_confirmed && updated.worker_confirmed) {
      playComplete()
      // Mark receipt complete
      await supabase
        .from('receipts')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          status: 'completed'
        })
        .eq('id', receipt.id)

      // Mark gig complete
      await supabase
        .from('gigs')
        .update({ status: 'completed' })
        .eq('id', gig.id)

      // Update worker gigs_completed count
      await supabase.rpc('increment_gigs_completed', {
        worker_id: updated.worker_id
      }).catch(() => null)

      // Notify both parties
      await supabase.from('notifications').insert([
        {
          user_id: updated.poster_id,
          title: 'Gig Completed! ✅',
          message: `"${gig.title}" is now complete. Please leave a review!`,
          type: 'review',
          gig_id: gig.id
        },
        {
          user_id: updated.worker_id,
          title: 'Gig Completed! ✅',
          message: `"${gig.title}" is now complete. Please leave a review!`,
          type: 'review',
          gig_id: gig.id
        }
      ])

      setStep('done')
      onComplete && onComplete()
    } else {
      // Notify other party to confirm
      const otherUserId = userRole === 'poster' ? updated.worker_id : updated.poster_id
      await supabase.from('notifications').insert({
        user_id: otherUserId,
        title: 'Confirmation Needed!',
        message: `${userRole === 'poster' ? 'Client' : 'Worker'} confirmed the receipt for "${gig.title}". Please confirm yours too.`,
        type: 'receipt',
        gig_id: gig.id
      })
      await fetchReceipt()
    }

    setConfirming(false)
  }

  const handleDispute = async () => {
    const reason = window.prompt('Please describe the issue briefly:')
    if (!reason) return

    await supabase
      .from('receipts')
      .update({
        disputed: true,
        dispute_reason: reason,
        status: 'disputed'
      })
      .eq('id', receipt.id)

    await supabase.from('notifications').insert({
      user_id: userRole === 'poster' ? receipt.worker_id : gig.poster_id,
      title: '⚠️ Dispute Raised',
      message: `A dispute was raised for "${gig.title}". Prima will review.`,
      type: 'general',
      gig_id: gig.id
    })

    setStep('dispute')
  }

  const myReceiptUrl = userRole === 'poster'
    ? receipt?.poster_receipt_url
    : receipt?.worker_receipt_url

  const otherReceiptUrl = userRole === 'poster'
    ? receipt?.worker_receipt_url
    : receipt?.poster_receipt_url

  const myConfirmed = userRole === 'poster'
    ? receipt?.poster_confirmed
    : receipt?.worker_confirmed

  const otherConfirmed = userRole === 'poster'
    ? receipt?.worker_confirmed
    : receipt?.poster_confirmed

  const otherLabel = userRole === 'poster' ? 'Worker' : 'Client'
  const myLabel = userRole === 'poster' ? 'Your' : 'Your'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '24px',
        padding: '28px', width: '100%', maxWidth: '480px',
        maxHeight: '90vh', overflowY: 'auto',
        border: '1.5px solid #E2E0FF',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '20px'
        }}>
          <div>
            <div style={{
              fontSize: '10px', color: '#6C47FF', fontWeight: '700',
              letterSpacing: '1.5px', textTransform: 'uppercase',
              marginBottom: '3px'
            }}>Receipt Confirmation</div>
            <div style={{
              fontSize: '18px', fontWeight: '800', color: '#14123A'
            }}>{gig.title}</div>
          </div>
          <button onClick={onClose} style={{
            background: '#F5F4FF', border: '1.5px solid #E2E0FF',
            borderRadius: '8px', width: '32px', height: '32px',
            fontSize: '16px', color: '#8B8FAF', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'inherit'
          }}>×</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#A09DC8' }}>
            Loading...
          </div>
        ) : (
          <>

            {/* Progress Steps */}
            <div style={{
              display: 'flex', gap: '0', marginBottom: '24px',
              background: '#F5F4FF', borderRadius: '12px',
              padding: '4px', overflow: 'hidden'
            }}>
              {[
                { key: 'upload', label: '1. Upload', icon: '📎' },
                { key: 'review', label: '2. Review', icon: '👁' },
                { key: 'confirm', label: '3. Confirm', icon: '✓' },
                { key: 'done', label: '4. Done', icon: '✅' },
              ].map((s, i) => {
                const steps = ['upload', 'review', 'confirm', 'done']
                const currentIndex = steps.indexOf(step)
                const thisIndex = steps.indexOf(s.key)
                const isDone = thisIndex < currentIndex
                const isCurrent = s.key === step ||
                  (step === 'review' && s.key === 'review')
                return (
                  <div key={s.key} style={{
                    flex: 1, textAlign: 'center',
                    padding: '8px 4px', borderRadius: '9px',
                    background: isCurrent ? '#6C47FF' : isDone ? '#EEE9FF' : 'transparent',
                    transition: 'all 0.2s'
                  }}>
                    <div style={{ fontSize: '14px', marginBottom: '2px' }}>
                      {isDone ? '✓' : s.icon}
                    </div>
                    <div style={{
                      fontSize: '9px', fontWeight: '700',
                      color: isCurrent ? '#fff' : isDone ? '#6C47FF' : '#A09DC8',
                      letterSpacing: '0.3px'
                    }}>{s.label}</div>
                  </div>
                )
              })}
            </div>

            {/* STEP — UPLOAD */}
            {step === 'upload' && (
              <div>
                <div style={{
                  background: '#EEE9FF', borderRadius: '14px',
                  padding: '16px', marginBottom: '20px',
                  border: '1.5px solid #B8A5FF'
                }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700',
                    color: '#14123A', marginBottom: '8px'
                  }}>📋 What your receipt must show:</div>
                  {[
                    'Your full name',
                    'Amount paid',
                    'Date of transaction',
                    'Description or reference',
                  ].map(item => (
                    <div key={item} style={{
                      display: 'flex', gap: '8px',
                      alignItems: 'center', marginBottom: '5px'
                    }}>
                      <div style={{
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#6C47FF', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', color: '#fff', fontWeight: '700',
                        flexShrink: 0
                      }}>✓</div>
                      <span style={{ fontSize: '12px', color: '#5B5887' }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    fontSize: '10px', fontWeight: '700', color: '#8B8FAF',
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    display: 'block', marginBottom: '6px'
                  }}>Amount Paid ($)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Enter exact amount paid"
                    style={{
                      width: '100%', background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF', borderRadius: '10px',
                      padding: '11px 14px', fontSize: '14px',
                      color: '#14123A', fontFamily: 'inherit',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                    onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                    onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    fontSize: '10px', fontWeight: '700', color: '#8B8FAF',
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    display: 'block', marginBottom: '6px'
                  }}>Notes (optional)</label>
                  <input
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Paid via bank transfer, ref: ABC123"
                    style={{
                      width: '100%', background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF', borderRadius: '10px',
                      padding: '11px 14px', fontSize: '13px',
                      color: '#14123A', fontFamily: 'inherit',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                    onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                    onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  />
                </div>

                <div
                  onClick={() => fileRef.current.click()}
                  style={{
                    background: '#F5F4FF',
                    border: '2px dashed #B8A5FF',
                    borderRadius: '14px', padding: '32px',
                    textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.15s', marginBottom: '16px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEE9FF'}
                  onMouseLeave={e => e.currentTarget.style.background = '#F5F4FF'}
                >
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>
                    {uploading ? '⏳' : '📎'}
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700', color: '#6C47FF',
                    marginBottom: '4px'
                  }}>
                    {uploading ? 'Uploading...' : 'Upload Your Receipt'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                    Photo, screenshot or PDF · Max 10MB
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                  />
                </div>

                <div style={{
                  background: '#FFF8E0', border: '1.5px solid #FFD966',
                  borderRadius: '10px', padding: '12px 14px',
                  fontSize: '12px', color: '#FF6B2B', lineHeight: '1.5'
                }}>
                  ⚠️ Both parties must upload receipts. The transaction is only confirmed when both sides submit proof and confirm.
                </div>
              </div>
            )}

            {/* STEP — REVIEW */}
            {step === 'review' && (
              <div>
                {/* My receipt status */}
                <div style={{
                  background: myReceiptUrl ? '#DFFDF4' : '#FFE8EE',
                  border: `1.5px solid ${myReceiptUrl ? '#7EECD2' : '#FF99B3'}`,
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: myReceiptUrl ? '10px' : '0'
                  }}>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: myReceiptUrl ? '#00C48C' : '#FF3366'
                    }}>
                      {myReceiptUrl ? '✓ Your receipt uploaded' : '⚠️ Your receipt missing'}
                    </div>
                    {myConfirmed && (
                      <span style={{
                        background: '#fff', border: '1px solid #7EECD2',
                        borderRadius: '6px', padding: '2px 8px',
                        fontSize: '10px', fontWeight: '700', color: '#00C48C'
                      }}>✓ Confirmed</span>
                    )}
                  </div>
                  {myReceiptUrl && (
                    <a href={myReceiptUrl} target="_blank" rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '12px', color: '#00C48C',
                        fontWeight: '600', textDecoration: 'none'
                      }}>
                      View my receipt →
                    </a>
                  )}
                  {!myReceiptUrl && (
                    <button
                      onClick={() => setStep('upload')}
                      style={{
                        marginTop: '8px', background: '#FF3366',
                        border: 'none', borderRadius: '8px',
                        padding: '8px 16px', fontSize: '12px',
                        fontWeight: '700', color: '#fff',
                        cursor: 'pointer', fontFamily: 'inherit'
                      }}>Upload Now</button>
                  )}
                </div>

                {/* Other party receipt status */}
                <div style={{
                  background: otherReceiptUrl ? '#DFFDF4' : '#F5F4FF',
                  border: `1.5px solid ${otherReceiptUrl ? '#7EECD2' : '#E2E0FF'}`,
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: otherReceiptUrl ? '10px' : '0'
                  }}>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: otherReceiptUrl ? '#00C48C' : '#A09DC8'
                    }}>
                      {otherReceiptUrl
                        ? `✓ ${otherLabel}'s receipt uploaded`
                        : `⏳ Waiting for ${otherLabel}'s receipt`}
                    </div>
                    {otherConfirmed && (
                      <span style={{
                        background: '#fff', border: '1px solid #7EECD2',
                        borderRadius: '6px', padding: '2px 8px',
                        fontSize: '10px', fontWeight: '700', color: '#00C48C'
                      }}>✓ Confirmed</span>
                    )}
                  </div>
                  {otherReceiptUrl && (
                    <a href={otherReceiptUrl} target="_blank" rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '12px', color: '#00C48C',
                        fontWeight: '600', textDecoration: 'none'
                      }}>
                      View {otherLabel.toLowerCase()}'s receipt →
                    </a>
                  )}
                </div>

                {/* Amount display */}
                {receipt?.amount > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #E8FFE4, #DFFDF4)',
                    border: '1.5px solid #7EECD2', borderRadius: '12px',
                    padding: '14px', marginBottom: '20px', textAlign: 'center'
                  }}>
                    <div style={{
                      fontSize: '10px', color: '#00C48C', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '4px'
                    }}>Transaction Amount</div>
                    <div style={{
                      fontSize: '28px', fontWeight: '800',
                      color: '#00C48C', letterSpacing: '-1px'
                    }}>${receipt.amount}</div>
                  </div>
                )}

                {/* Confirm button */}
                {myReceiptUrl && otherReceiptUrl && !myConfirmed && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    style={{
                      width: '100%',
                      background: confirming
                        ? '#B8A5FF'
                        : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                      border: 'none', borderRadius: '12px',
                      padding: '14px', fontSize: '14px',
                      fontWeight: '700', color: '#fff',
                      cursor: confirming ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(108,71,255,0.35)',
                      fontFamily: 'inherit', marginBottom: '10px'
                    }}>
                    {confirming ? '⏳ Confirming...' : '✓ I Confirm This Transaction'}
                  </button>
                )}

                {myReceiptUrl && !otherReceiptUrl && (
                  <div style={{
                    background: '#FFF8E0', border: '1.5px solid #FFD966',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '12px', color: '#FF6B2B',
                    lineHeight: '1.5', marginBottom: '10px'
                  }}>
                    ⏳ Waiting for {otherLabel} to upload their receipt before you can confirm.
                  </div>
                )}

                {myConfirmed && !otherConfirmed && (
                  <div style={{
                    background: '#DFFDF4', border: '1.5px solid #7EECD2',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '12px', color: '#00C48C',
                    lineHeight: '1.5', marginBottom: '10px'
                  }}>
                    ✓ You confirmed! Waiting for {otherLabel} to confirm.
                  </div>
                )}

                {/* Dispute button */}
                {myReceiptUrl && (
                  <button
                    onClick={handleDispute}
                    style={{
                      width: '100%', background: 'transparent',
                      border: '1.5px solid #FF99B3',
                      borderRadius: '12px', padding: '12px',
                      fontSize: '12px', fontWeight: '600',
                      color: '#FF3366', cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}>
                    ⚠️ Raise a Dispute
                  </button>
                )}
              </div>
            )}

            {/* STEP — DONE */}
            {step === 'done' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800',
                  color: '#00C48C', marginBottom: '8px'
                }}>Transaction Complete!</div>
                <div style={{
                  fontSize: '13px', color: '#8B8FAF',
                  lineHeight: '1.6', marginBottom: '24px'
                }}>
                  Both parties confirmed. The gig is officially complete.
                  Please leave a review for each other.
                </div>
                {receipt?.amount > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #E8FFE4, #DFFDF4)',
                    border: '1.5px solid #7EECD2', borderRadius: '14px',
                    padding: '16px', marginBottom: '20px'
                  }}>
                    <div style={{
                      fontSize: '10px', color: '#00C48C', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.8px',
                      marginBottom: '4px'
                    }}>Amount Confirmed</div>
                    <div style={{
                      fontSize: '28px', fontWeight: '800', color: '#00C48C'
                    }}>${receipt.amount}</div>
                  </div>
                )}
                <button onClick={onClose} style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  border: 'none', borderRadius: '12px', padding: '14px',
                  fontSize: '14px', fontWeight: '700', color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
                }}>Close & Leave Review</button>
              </div>
            )}

            {/* STEP — DISPUTE */}
            {step === 'dispute' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                <div style={{
                  fontSize: '20px', fontWeight: '800',
                  color: '#FF3366', marginBottom: '8px'
                }}>Dispute Raised</div>
                <div style={{
                  fontSize: '13px', color: '#8B8FAF',
                  lineHeight: '1.6', marginBottom: '16px'
                }}>
                  This transaction is under review. Prima will examine both receipts and resolve within 48 hours.
                </div>
                {receipt?.dispute_reason && (
                  <div style={{
                    background: '#FFE8EE', border: '1.5px solid #FF99B3',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', color: '#FF3366',
                    lineHeight: '1.5', marginBottom: '16px',
                    textAlign: 'left'
                  }}>
                    <strong>Reason:</strong> {receipt.dispute_reason}
                  </div>
                )}
                <button onClick={onClose} style={{
                  width: '100%', background: '#F5F4FF',
                  border: '1.5px solid #E2E0FF', borderRadius: '12px',
                  padding: '14px', fontSize: '13px', fontWeight: '600',
                  color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
                }}>Close</button>
              </div>
            )}
          </>
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