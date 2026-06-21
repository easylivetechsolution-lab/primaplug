import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { useCredits } from '../../context/CreditsContext'
import { getCurrency } from '../../data/currencies'
import EmptyState from '../EmptyState'
import { CREDITS_PER_DOLLAR } from '../../utils/payments'
import { startFincraWalletFunding, verifyFincraPayment } from '../../utils/fincra'


export default function CommissionScreen() {
  const { user, profile } = useAuth()
  const {
    credits, commissions, pendingCommissions,
    totalOwed, hasUnpaidCommissions,
    spendCredits, fetchCommissions
  } = useCredits()
  const [paying, setPaying] = useState(null)
  const [showPayment, setShowPayment] = useState(false)
  const [selectedCommission] = useState(null)

  useEffect(() => {
  const handleReturn = async (e) => {
    const reference = e.detail?.reference
    if (!reference) return
    try {
      await verifyFincraPayment(supabase, reference)
      await fetchCommissions()
    } catch (err) {
      console.error('Verify commission payment error:', err)
    }
  }
  window.addEventListener('walletPaymentReturn', handleReturn)
  return () => window.removeEventListener('walletPaymentReturn', handleReturn)
}, [fetchCommissions])

  const handlePayWithCredits = async (commission) => {
    const creditsNeeded = commission.commission_amount * CREDITS_PER_DOLLAR
    const currentBalance = credits?.balance || 0

    if (currentBalance < creditsNeeded) {
      alert(`You need ${creditsNeeded} Prima Credits but only have ${currentBalance}. Please pay via bank transfer.`)
      return
    }

    setPaying(commission.id)
    try {
      const success = await spendCredits(
        creditsNeeded,
        'commission_payment',
        `Commission payment for gig`,
        commission.gig_id
      )

      if (success) {
        await supabase
          .from('commissions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            payment_method: 'credits'
          })
          .eq('id', commission.id)

        // Restore trust score if it was penalized
        await supabase.rpc('check_commission_status', {
          p_worker_id: user.id
        })

        await supabase.from('notifications').insert({
          user_id: user.id,
          title: '✅ Commission Paid!',
          message: `Platform commission paid using Prima Credits. Your account is in good standing.`,
          type: 'general'
        })

        await fetchCommissions()
      }
    } catch (e) {
      alert('Payment error: ' + e.message)
    }
    setPaying(null)
  }

  const daysUntilDue = (dueDate) => {
    const days = Math.floor(
      (new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)
    )
    return days
  }

  const getStatusColor = (commission) => {
    if (commission.status === 'paid') return { color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' }
    const days = daysUntilDue(commission.due_date)
    if (days < 0) return { color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' }
    if (days < 3) return { color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99' }
    return { color: '#FFB800', bg: '#FFF8E0', border: '#FFD966' }
  }

  const paidCommissions = commissions.filter(c => c.status === 'paid')

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '22px', fontWeight: '800',
          color: '#14123A', marginBottom: '4px'
        }}>Platform Commission</div>
        <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
          10% of your earnings goes to Prima
        </div>
      </div>

      {/* Balance Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '12px', marginBottom: '20px'
      }}>
        <div style={{
          background: hasUnpaidCommissions
            ? 'linear-gradient(135deg, #FF3366, #FF6B9B)'
            : 'linear-gradient(135deg, #00C48C, #00A878)',
          borderRadius: '16px', padding: '18px', color: '#fff'
        }}>
          <div style={{
            fontSize: '10px', opacity: 0.8,
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '6px'
          }}>Amount Owed</div>
          <div style={{
            fontSize: '26px', fontWeight: '800',
            letterSpacing: '-1px'
          }}>
            {totalOwed > 0 ? `$${totalOwed.toFixed(2)}` : '$0.00'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '3px' }}>
            {pendingCommissions.length} pending
          </div>
        </div>

        <div style={{
          background: '#fff', border: '1.5px solid #E2E0FF',
          borderRadius: '16px', padding: '18px'
        }}>
          <div style={{
            fontSize: '10px', color: '#A09DC8',
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '6px', fontWeight: '700'
          }}>Prima Credits</div>
          <div style={{
            fontSize: '26px', fontWeight: '800',
            color: '#6C47FF', letterSpacing: '-1px'
          }}>
            {credits?.balance?.toFixed(0) || 0}
          </div>
          <div style={{
            fontSize: '11px', color: '#A09DC8', marginTop: '3px'
          }}>
            ≈ ${((credits?.balance || 0) / CREDITS_PER_DOLLAR).toFixed(2)} value
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      {hasUnpaidCommissions && (
        <div style={{
          background: '#FFF0E8', border: '1.5px solid #FFBC99',
          borderRadius: '14px', padding: '14px 16px',
          marginBottom: '20px',
          display: 'flex', gap: '10px', alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{
              fontSize: '13px', fontWeight: '700',
              color: '#FF6B2B', marginBottom: '3px'
            }}>You have unpaid platform commission</div>
            <div style={{
              fontSize: '12px', color: '#FF6B2B',
              opacity: 0.8, lineHeight: '1.5'
            }}>
              Pay within 3 days to keep applying for gigs. Overdue commission restricts new applications until paid.
            </div>
          </div>
        </div>
      )}

      {/* Pending Commissions */}
      {pendingCommissions.length > 0 && (
        <div style={{
          background: '#fff', border: '1.5px solid #E2E0FF',
          borderRadius: '16px', padding: '18px',
          marginBottom: '14px'
        }}>
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#A09DC8',
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '14px'
          }}>Pending ({pendingCommissions.length})</div>

          {pendingCommissions.map((commission, i) => {
            const colors = getStatusColor(commission)
            const days = daysUntilDue(commission.due_date)
            const creditsNeeded = commission.commission_amount * CREDITS_PER_DOLLAR
            const canPayWithCredits = (credits?.balance || 0) >= creditsNeeded

            return (
              <div key={commission.id} style={{
                padding: '14px 0',
                borderBottom: i < pendingCommissions.length - 1
                  ? '1px solid #F5F4FF' : 'none'
              }}>
                {/* Commission amount display */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: '10px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: '#14123A', marginBottom: '3px'
                    }}>{commission.gigs?.title || 'Gig'}</div>
                    <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                      You earned: {getCurrency(commission.currency || 'NGN').symbol}
                      {commission.gig_amount?.toLocaleString()} ·
                      Fee: {getCurrency(commission.currency || 'NGN').symbol}
                      {commission.commission_amount?.toLocaleString()}
                      {commission.currency === 'NGN' && commission.commission_amount === 500
                        ? ' (minimum ₦500)'
                        : commission.commission_amount === 2
                          ? ' (minimum $2)'
                          : ' (10%)'}
                    </div>
                  </div>
                  <div style={{
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    borderRadius: '7px', padding: '4px 10px',
                    fontSize: '10px', fontWeight: '700',
                    color: colors.color, flexShrink: 0
                  }}>
                    {days < 0
                      ? `${Math.abs(days)}d overdue`
                      : days === 0 ? 'Due today'
                      : `${days}d left`}
                  </div>
                </div>

                {/* Payment buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
  onClick={async () => {
  setPaying(commission.id)
  try {
    const response = await startFincraWalletFunding(supabase, {
      amount: commission.commission_amount,
      currency: commission.currency || 'NGN',
      user_id: user.id,
      email: user?.email || '',
      name: profile?.full_name || 'Prima User',
    })
    if (!response?.checkoutUrl) throw new Error('Fincra did not return a checkout URL.')

    // Link this exact transaction to this exact commission row —
    // no ambiguity even if amounts happen to match across commissions
    const { error: tagError } = await supabase
      .from('wallet_transactions')
      .update({
        description: `Commission payment for gig`,
        related_commission_id: commission.id,
      })
      .eq('fincra_reference', response.reference)

    if (tagError) {
      console.error('Failed to tag commission transaction:', tagError)
    }

    window.location.href = response.checkoutUrl
  } catch (e) {
    alert(e.message || 'Could not start Fincra payment.')
    setPaying(null)
  }
}}
                    disabled={paying === commission.id}
                    style={{
                      flex: 2,
                      background: paying === commission.id
                        ? '#E2E0FF'
                        : 'linear-gradient(135deg, #00A878, #00C48C)',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '13px',
                      fontWeight: '700',
                      color: paying === commission.id ? '#A09DC8' : '#fff',
                      cursor: paying === commission.id ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    {paying === commission.id ? 'Processing...' : 'Pay with Fincra'}
                  </button>

                  {/* Pay with Credits */}
                  <button
                    onClick={() => handlePayWithCredits(commission)}
                    disabled={paying === commission.id || !canPayWithCredits}
                    style={{
                      flex: 1,
                      background: !canPayWithCredits
                        ? '#F5F4FF'
                        : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                      border: !canPayWithCredits
                        ? '1.5px solid #E2E0FF' : 'none',
                      borderRadius: '10px', padding: '12px',
                      fontSize: '12px', fontWeight: '700',
                      color: !canPayWithCredits ? '#A09DC8' : '#fff',
                      cursor: !canPayWithCredits ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '5px'
                    }}>
                    ⭐ Credits
                  </button>
                </div>

                {!canPayWithCredits && (
                  <div style={{
                    fontSize: '10px', color: '#A09DC8',
                    marginTop: '5px', textAlign: 'right'
                  }}>
                    Need {creditsNeeded} credits to pay with credits
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Paid History */}
      {paidCommissions.length > 0 && (
        <div style={{
          background: '#fff', border: '1.5px solid #E2E0FF',
          borderRadius: '16px', padding: '18px'
        }}>
          <div style={{
            fontSize: '11px', fontWeight: '700', color: '#A09DC8',
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '14px'
          }}>Payment History ({paidCommissions.length})</div>
          {paidCommissions.map((commission, i) => {
            const curr = getCurrency(commission.currency || 'NGN')
            return (
              <div key={commission.id} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '10px 0',
                borderBottom: i < paidCommissions.length - 1
                  ? '1px solid #F5F4FF' : 'none'
              }}>
                <div>
                  <div style={{
                    fontSize: '13px', fontWeight: '600',
                    color: '#14123A', marginBottom: '2px'
                  }}>{commission.gigs?.title || 'Gig'}</div>
                  <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                    {commission.payment_method === 'credits'
                      ? '⭐ Paid with Credits'
                      : '🏦 Bank Transfer'} ·{' '}
                    {new Date(commission.paid_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric'
                    })}
                  </div>
                </div>
                <div style={{
                  background: '#DFFDF4', border: '1px solid #7EECD2',
                  borderRadius: '7px', padding: '4px 10px',
                  fontSize: '12px', fontWeight: '700', color: '#00C48C'
                }}>
                  ✓ {curr.symbol}{commission.commission_amount.toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {commissions.length === 0 && (
        <EmptyState
          icon="commission"
          tone="money"
          title="No commissions yet"
          message="When you complete a gig and both parties confirm the receipt, your 10% platform fee will appear here."
        />
      )}

      {/* Bank Transfer Modal */}
      {showPayment && selectedCommission && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: '20px',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }} onClick={() => setShowPayment(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '24px',
            padding: '28px', width: '100%', maxWidth: '440px',
            border: '1.5px solid #E2E0FF',
            boxShadow: '0 20px 60px rgba(108,71,255,0.25)'
          }}>
            <div style={{
              fontSize: '20px', fontWeight: '800',
              color: '#14123A', marginBottom: '6px'
            }}>Bank Transfer</div>
            <div style={{
              fontSize: '13px', color: '#8B8FAF',
              marginBottom: '20px', lineHeight: '1.6'
            }}>
              Transfer your commission to Prima's account then send proof to get verified.
            </div>

            <div style={{
              background: '#F5F4FF', borderRadius: '14px',
              padding: '16px', marginBottom: '16px'
            }}>
              <div style={{
                fontSize: '10px', color: '#A09DC8', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                marginBottom: '12px'
              }}>Transfer Details</div>
              {[
                ['Amount', `$${selectedCommission.commission_amount.toFixed(2)}`],
                ['Bank', 'Your actual bank name'],
                ['Account Name', 'Your actual account name'],
                ['Account Number', 'Your actual account number'],
                ['Reference', `PRIMA-${selectedCommission.id.substring(0, 8).toUpperCase()}`],
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '8px 0',
                  borderBottom: label !== 'Reference' ? '1px solid #E2E0FF' : 'none'
                }}>
                  <span style={{ fontSize: '12px', color: '#8B8FAF' }}>{label}</span>
                  <span style={{
                    fontSize: '13px', fontWeight: '700', color: '#14123A'
                  }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{
              background: '#EEE9FF', border: '1.5px solid #B8A5FF',
              borderRadius: '12px', padding: '14px',
              fontSize: '12px', color: '#6C47FF',
              lineHeight: '1.6', marginBottom: '20px'
            }}>
              After transferring, send your payment screenshot to{' '}
              <strong>payments@primaplug.com</strong> with your reference number. We'll verify within 24 hours.
            </div>

            <button
              onClick={() => setShowPayment(false)}
              style={{
                width: '100%', background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
              }}>Got It</button>
          </div>
        </div>
      )}
    </div>
  )
}
