import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { useCredits } from '../../context/CreditsContext'
import { getCurrency } from '../../data/currencies'
import PublicProfile from '../PublicProfile'
import { getPendingGigReferralForPayout } from '../../utils/referral'
import ReceiptFlow from '../ReceiptFlow'
import LiveTracking from '../LiveTracking'
import EditGig from '../EditGig'
import BrandIcon from '../BrandIcon'
import { sendPushToUser } from '../../utils/pushNotifications'
import { PAYMENT_METHODS } from '../../utils/payments'

// ─── CONSTANTS ───────────────────────────────────────
const TABS = [
  { key: 'myposts', icon: 'mygigs', label: 'My Posts' },
  { key: 'myjobs', icon: 'applied', label: 'My Jobs' },
]

// ─── HELPERS ─────────────────────────────────────────
const timeAgo = (date) => {
  if (!date) return ''
  const s = Math.floor((new Date() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const daysSince = (date) => {
  if (!date) return 0
  return Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24))
}

// ─── MAIN COMPONENT ───────────────────────────────────
export default function MyGigsScreen() {
  const { user, profile } = useAuth()
  const { pendingCommissions, totalOwed } = useCredits()

  const [tab, setTab] = useState('myposts')

  const [postedGigs, setPostedGigs] = useState([])
  const [workingGigs, setWorkingGigs] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showActions, setShowActions] = useState(false)

  // Modals
  const [receiptGig, setReceiptGig] = useState(null)

  const [trackingGig, setTrackingGig] = useState(null)
  const [editingGig, setEditingGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applicantsGig, setApplicantsGig] = useState(null)

  useEffect(() => {
    if (user) {
      fetchAll()
      return subscribeToUpdates()
    }
  }, [user])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchPostedGigs(), fetchWorkingGigs(), fetchActions()])
    setLoading(false)
  }

  const subscribeToUpdates = () => {
    const channel = supabase
      .channel('mygigs-' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'gigs'
      }, () => fetchAll())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'receipts'
      }, () => fetchAll())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'applications'
      }, () => fetchAll())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  const fetchPostedGigs = async () => {
    const { data } = await supabase
      .from('gigs')
      .select(`
        *,
        applications(
          id, status, worker_id, accepted_at,
          users(id, full_name, avatar_url, rating, trust_score, level)
        ),
        receipts(
          id, amount, currency, commission_amount,
          poster_confirmed, worker_confirmed,
          completed, disputed, status
        ),
        worker:users!gigs_worker_id_fkey(
          id, full_name, avatar_url, rating, trust_score
        )
      `)
      .eq('poster_id', user.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
    if (data) setPostedGigs(data)
  }

  const fetchWorkingGigs = async () => {
    const { data } = await supabase
      .from('applications')
      .select(`
        id, status, created_at, accepted_at, worker_id,
        gigs(
          *,
          receipts(
            id, amount, currency, commission_amount,
            poster_confirmed, worker_confirmed,
            completed, disputed, status
          ),
          poster:users!gigs_poster_id_fkey(
            id, full_name, avatar_url, rating, trust_score
          )
        )
      `)
      .eq('worker_id', user.id)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })

    if (data) {
      const valid = data.filter(a => a.gigs)
      setWorkingGigs(valid)
    }
  }

  const fetchActions = async () => {
    try {
      const { data } = await supabase.rpc('get_user_actions', {
        p_user_id: user.id
      })
      if (data) setActions(data.sort((a, b) => a.priority - b.priority))
    } catch (e) {
      console.log('Actions error:', e)
    }
  }

  // ─── ACTIONS ───────────────────────────────────────

  const acceptApplication = async (gig, application) => {
    try {
      const isWalletGig = gig.payment_method === PAYMENT_METHODS.WALLET

      // If wallet gig, lock escrow first before accepting
      if (isWalletGig) {
        const escrowAmount = Number(gig.pay_min)

        const { data: lockResult, error: lockError } = await supabase
          .rpc('lock_gig_escrow', {
            p_user_id: gig.poster_id,
            p_gig_id: gig.id,
            p_amount: escrowAmount
          })

        if (lockError) throw lockError

        if (!lockResult) {
          alert('Your wallet balance is not enough to accept this worker. Please fund your wallet or use a manual-payment gig.')
          window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'wallet' }))
          return
        }
      }

      // Accept this application
      const { error: acceptError } = await supabase
        .from('applications')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', application.id)

      if (acceptError) throw acceptError

      // Update gig with worker_id
      const { error: gigError } = await supabase
        .from('gigs')
        .update({
          status: 'in_progress',
          worker_id: application.worker_id,
          worker_name: application.users?.full_name,
          accepted_at: new Date().toISOString()
        })
        .eq('id', gig.id)

      if (gigError) throw gigError

      // Notify accepted worker
      // Check if this gig has a pending referral, to inform the worker
const gigReferral = await getPendingGigReferralForPayout(gig.id)
const referralNote = gigReferral
  ? ' Note: 5% of this gig\'s payment goes to the person who referred you to it.'
  : ''

// Notify accepted worker
const { error: notifError } = await supabase
  .from('notifications')
  .insert({
    user_id: application.worker_id,
    title: isWalletGig
      ? '🎉 You Got The Job! Payment secured in escrow.'
      : '🎉 You Got The Job!',
    message: `Your application for "${gig.title}" was accepted! ${
      isWalletGig
        ? 'Funds are locked in escrow and will be released when you complete the work.'
        : 'Get in touch with the poster and get started.'
    }${referralNote}`,
    type: 'accepted',
    gig_id: gig.id
  })

      if (notifError) console.error('Notification error:', notifError)

      // Send push notification
      try {
        await sendPushToUser(
          application.worker_id,
          '🎉 You Got The Job!',
          `Your application for "${gig.title}" was accepted!`,
          { type: 'accepted', gigId: gig.id }
        )
      } catch (e) {
        console.log('Push error:', e)
      }

      // Decline all other pending applications
      const otherPendingApps = gig.applications?.filter(
        a => a.id !== application.id && a.status === 'pending'
      ) || []

      if (otherPendingApps.length > 0) {
        await supabase
          .from('applications')
          .update({ status: 'declined' })
          .eq('gig_id', gig.id)
          .neq('id', application.id)
          .eq('status', 'pending')

        await supabase.from('notifications').insert(
          otherPendingApps.map(a => ({
            user_id: a.worker_id,
            title: 'Application Update',
            message: `Your application for "${gig.title}" was not selected this time.`,
            type: 'rejected',
            gig_id: gig.id
          }))
        )
      }

      await fetchAll()
      alert(isWalletGig
        ? 'Application accepted! Funds are now locked in escrow.'
        : 'Application accepted! Worker has been notified.')

    } catch (e) {
      console.error('Accept error:', e)
      alert('Error accepting: ' + e.message)
    }
  }

  const releaseEscrow = async (gig) => {
  try {
    const amount = Number(gig.escrow_amount || gig.pay_min)
    const referral = await getPendingGigReferralForPayout(gig.id)

    if (referral) {
      const referrerShare = amount * 0.05
      const { error } = await supabase.rpc('release_gig_escrow_with_referral', {
        p_gig_id: gig.id,
        p_poster_id: gig.poster_id,
        p_worker_id: gig.worker_id,
        p_amount: amount,
        p_referrer_id: referral.referrer_id,
        p_referrer_share: referrerShare
      })

      if (error) throw error

      await markGigReferralPaid(referral.id, amount, gig.currency, referrerShare)

      await supabase.from('notifications').insert({
        user_id: referral.referrer_id,
        title: '🎉 Gig Referral Reward!',
        message: `You earned ${gig.currency || 'NGN'} ${referrerShare.toLocaleString()} (5% of the gig payment) for referring this gig!`,
        type: 'wallet',
        gig_id: gig.id
      })
    } else {
      const { error } = await supabase.rpc('release_gig_escrow', {
        p_gig_id: gig.id,
        p_poster_id: gig.poster_id,
        p_worker_id: gig.worker_id,
        p_amount: amount
      })

      if (error) throw error
    }
      // Mark gig completed
      await supabase
        .from('gigs')
        .update({ status: 'completed' })
        .eq('id', gig.id)

      // Notify worker funds released
      await supabase.from('notifications').insert({
        user_id: gig.worker_id,
        title: '💸 Payment Released!',
        message: `Your payment for "${gig.title}" has been released to your Prima wallet. Withdraw anytime.`,
        type: 'wallet',
        gig_id: gig.id
      })

      try {
        await sendPushToUser(
          gig.worker_id,
          '💸 Payment Released!',
          `Your payment for "${gig.title}" has been released to your wallet.`,
          { type: 'wallet', gigId: gig.id }
        )
      } catch (e) {
        console.log('Push error:', e)
      }

      await fetchAll()

    } catch (e) {
      console.error('Release escrow error:', e)
      alert('Error releasing payment: ' + e.message)
    }
  }
  const declineApplication = async (application, gigTitle) => {
    await supabase
      .from('applications')
      .update({ status: 'declined', declined_at: new Date().toISOString() })
      .eq('id', application.id)

    await supabase.from('notifications').insert({
      user_id: application.worker_id,
      title: 'Application Update',
      message: `Your application for "${gigTitle}" was not selected.`,
      type: 'rejected',
      gig_id: application.gig_id
    })

    try {
      await sendPushToUser(
        application.worker_id,
        'Application Update',
        `Your application for "${gigTitle}" was not selected.`,
        { type: 'rejected', gigId: application.gig_id }
      )
    } catch (e) {
      console.log('Push error:', e)
    }

    await fetchAll()
  }

  const deleteGig = async (gigId) => {
    if (!window.confirm('Delete this gig?')) return
    await supabase.from('gigs').delete().eq('id', gigId)
    await fetchAll()
  }

  // ─── FILTER LOGIC ──────────────────────────────────

  const getPostedGigStatus = (gig) => {
    const receipt = gig.receipts?.[0]
    const pendingApps = gig.applications?.filter(a => a.status === 'pending') || []
    const acceptedApp = gig.applications?.find(a => a.status === 'accepted')

    if (receipt?.completed) return 'completed'
    if (receipt?.poster_confirmed && !receipt?.worker_confirmed) return 'waiting'
    if (gig.status === 'in_progress') return 'inprogress'
    if (acceptedApp) return 'inprogress'
    if (pendingApps.length > 0) return 'hasapplicants'
    return 'open'
  }

  const getWorkingGigStatus = (application) => {
    const gig = application.gigs
    const receipt = gig?.receipts?.[0]

    if (receipt?.completed) return 'completed'
    if (receipt?.poster_confirmed && !receipt?.worker_confirmed) return 'confirmreceipt'
    if (application.status === 'accepted') return 'inprogress'
    if (application.status === 'declined') return 'declined'
    return 'pending'
  }

  // ─── ACTION COUNTS ─────────────────────────────────

  const postedActionCount = postedGigs.filter(g =>
    ['hasapplicants', 'waiting'].includes(getPostedGigStatus(g))
  ).length

  const workingActionCount = workingGigs.filter(a =>
    getWorkingGigStatus(a) === 'confirmreceipt'
  ).length + pendingCommissions.length

  const totalActionCount = postedActionCount + workingActionCount

  const postedInProgressCount = postedGigs.filter(g =>
    getPostedGigStatus(g) === 'inprogress'
  ).length
  const workingInProgressCount = workingGigs.filter(a =>
    getWorkingGigStatus(a) === 'inprogress'
  ).length

  // ─── STYLES ────────────────────────────────────────

  const sectionHeader = () => null

  // ─── RENDER ────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: '#F8F7FF'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F8F7FF 100%)',
        padding: '18px 20px 0',
        borderBottom: '1.5px solid #E2E0FF', flexShrink: 0,
        boxShadow: '0 10px 30px rgba(20,18,58,0.06)'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', gap: '14px', marginBottom: '14px'
        }}>
          <div>
            <div style={{
              fontSize: '24px', fontWeight: '900', color: '#14123A',
              lineHeight: 1.05
            }}>My Gigs</div>
            <div style={{
              fontSize: '13px', color: '#6F7394',
              fontWeight: '650', marginTop: '5px'
            }}>
              Manage your posted work and active jobs
            </div>
          </div>
          <div style={{
            background: '#14123A', color: '#fff',
            borderRadius: '14px', padding: '10px 12px',
            minWidth: '74px', textAlign: 'center',
            boxShadow: '0 10px 22px rgba(20,18,58,0.16)'
          }}>
            <div style={{ fontSize: '22px', fontWeight: '900', lineHeight: 1 }}>
              {postedGigs.length + workingGigs.length}
            </div>
            <div style={{
              fontSize: '10px', fontWeight: '800',
              color: '#C9C6FF', textTransform: 'uppercase',
              letterSpacing: '0.6px', marginTop: '4px'
            }}>
              Total
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '8px', marginBottom: '12px'
        }}>
          <HeaderStat label="Posted" value={postedGigs.length} color="#6C47FF" />
          <HeaderStat label="Working" value={workingGigs.length} color="#00A878" />
          <HeaderStat
            label="Active"
            value={postedInProgressCount + workingInProgressCount}
            color="#FF6B2B"
          />
        </div>

        {/* Smart Action Banner */}
        {totalActionCount > 0 && (
          <div
            onClick={() => setShowActions(s => !s)}
            style={{
              background: '#FFE8EE', border: '1.5px solid #FF99B3',
              borderRadius: '12px', padding: '10px 14px',
              marginBottom: '12px', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center'
            }}>
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'center'
            }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: '#FF3366', color: '#fff',
                fontSize: '11px', fontWeight: '800',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0
              }}>{totalActionCount}</div>
              <div style={{
                fontSize: '13px', fontWeight: '700', color: '#FF3366'
              }}>
                {totalActionCount} thing{totalActionCount > 1 ? 's' : ''} need your attention
              </div>
            </div>
            <span style={{
              fontSize: '12px', color: '#FF3366',
              fontWeight: '600'
            }}>{showActions ? '▲' : '▼'}</span>
          </div>
        )}

        {/* Expanded Action List */}
        {showActions && totalActionCount > 0 && (
          <div style={{
            background: '#fff', border: '1.5px solid #E2E0FF',
            borderRadius: '12px', padding: '8px',
            marginBottom: '12px'
          }}>
            {actions.map((action, i) => (
              <div
                key={i}
                onClick={() => {
                  setShowActions(false)
                  if (action.action_type === 'confirm_receipt' ||
                    action.action_type === 'upload_receipt') {
                    const gig = action.action_type === 'confirm_receipt'
                      ? workingGigs.find(a =>
                          a.gigs?.id === action.gig_id
                        )?.gigs
                      : postedGigs.find(g => g.id === action.gig_id)
                    if (gig) setReceiptGig(gig)
                  } else if (action.action_type === 'review_applicants') {
                    const gig = postedGigs.find(g => g.id === action.gig_id)
                    if (gig) setApplicantsGig(gig)
                  } else if (action.action_type === 'commission_overdue' ||
                    action.action_type === 'commission_due_soon') {
                    window.dispatchEvent(
                      new CustomEvent('navigateTo', { detail: 'commission' })
                    )
                  }
                }}
                style={{
                  display: 'flex', gap: '10px', alignItems: 'center',
                  padding: '10px 10px',
                  borderBottom: i < actions.length - 1
                    ? '1px solid #F5F4FF' : 'none',
                  cursor: 'pointer', borderRadius: '8px',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e =>
                  e.currentTarget.style.background = '#F5F4FF'}
                onMouseLeave={e =>
                  e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: action.priority <= 2 ? '#FF3366'
                    : action.priority <= 4 ? '#FF6B2B' : '#6C47FF',
                  flexShrink: 0
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '12px', fontWeight: '700',
                    color: '#14123A', marginBottom: '1px'
                  }}>{action.title}</div>
                  <div style={{
                    fontSize: '10px', color: '#8B8FAF'
                  }}>{action.gig_title}</div>
                </div>
                <span style={{
                  fontSize: '12px', color: '#A09DC8'
                }}>→</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {TABS.map(t => {
            const active = tab === t.key
            const badge = t.key === 'myposts'
              ? postedActionCount
              : t.key === 'myjobs'
                ? workingActionCount
                : 0
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  borderBottom: `2.5px solid ${active ? '#6C47FF' : 'transparent'}`,
                  padding: '8px 4px', cursor: 'pointer',
                  fontFamily: 'inherit', position: 'relative',
                  transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: '3px'
                }}>
                <BrandIcon name={t.icon} size={26} active={active} />
                <span style={{
                  fontSize: '11px', fontWeight: active ? '700' : '500',
                  color: active ? '#6C47FF' : '#8B8FAF'
                }}>{t.label}</span>
                {badge > 0 && (
                  <span style={{
                    position: 'absolute', top: '4px', right: '12px',
                    background: '#FF3366', color: '#fff',
                    borderRadius: '50%', width: '16px', height: '16px',
                    fontSize: '9px', fontWeight: '800',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center'
                  }}>{badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 16px 100px'
      }}>
        {loading ? (
          <div style={{
            textAlign: 'center', padding: '48px',
            color: '#A09DC8', fontSize: '14px'
          }}>Loading...</div>
        ) : (
          <>
            {/* ── MY POSTS TAB ── */}
            {tab === 'myposts' && (
              <PostedTab
  gigs={postedGigs}
  getStatus={getPostedGigStatus}
  onAccept={acceptApplication}
  onDecline={declineApplication}
  onDelete={deleteGig}
  onReceipt={setReceiptGig}
  onEdit={setEditingGig}
  onViewProfile={setViewingProfile}
  onViewApplicants={setApplicantsGig}
  onTrack={(gig) => setTrackingGig({
    gig, role: 'poster', workerInfo: gig.worker
  })}
  onRelease={releaseEscrow}
  onRefresh={fetchAll}
  sectionHeader={sectionHeader}
  userId={user?.id}
/>
            )}

            {/* ── MY JOBS TAB ── */}
            {tab === 'myjobs' && (
              <WorkingTab
                applications={workingGigs}
                getStatus={getWorkingGigStatus}
                pendingCommissions={pendingCommissions}
                totalOwed={totalOwed}
                onReceipt={(gig) => setReceiptGig(gig)}
                onViewProfile={setViewingProfile}
                onTrack={(gig) => setTrackingGig({
                  gig, role: 'worker', posterInfo: gig.poster
                })}
                onRefresh={fetchAll}
                sectionHeader={sectionHeader}
                userId={user?.id}
              />
            )}
          </>
        )}
      </div>

      {/* ── MODALS ── */}
      {receiptGig && (
        <ReceiptFlow
          gig={receiptGig}
          onClose={() => setReceiptGig(null)}
          onComplete={() => {
            setReceiptGig(null)
            fetchAll()
          }}
        />
      )}

      {trackingGig && (
        <LiveTracking
          gig={trackingGig.gig}
          role={trackingGig.role}
          workerInfo={trackingGig.workerInfo}
          posterInfo={trackingGig.posterInfo}
          onClose={() => setTrackingGig(null)}
        />
      )}

      {editingGig && (
        <EditGig
          gig={editingGig}
          onClose={() => setEditingGig(null)}
          onUpdated={() => {
            setEditingGig(null)
            fetchAll()
          }}
        />
      )}

      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      {/* Applicants Sheet */}
      {applicantsGig && (
        <ApplicantsSheet
          gig={applicantsGig}
          onClose={() => setApplicantsGig(null)}
          onAccept={(app) => {
            acceptApplication(applicantsGig, app)
            setApplicantsGig(null)
          }}
          onDecline={(app) => {
            declineApplication(app, applicantsGig.title)
          }}
          onViewProfile={setViewingProfile}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// POSTED TAB
// ══════════════════════════════════════════
function PostedTab({
  gigs, getStatus, onAccept, onDecline, onDelete,
  onReceipt, onEdit, onViewProfile, onViewApplicants,
  onTrack, onRelease, onRefresh, sectionHeader, userId
}) {
  const actionGigs = gigs.filter(g =>
    ['hasapplicants', 'waiting'].includes(getStatus(g))
  )
  const inProgressGigs = gigs.filter(g => getStatus(g) === 'inprogress')
  const openGigs = gigs.filter(g => getStatus(g) === 'open')
  const completedGigs = gigs.filter(g => getStatus(g) === 'completed')

  if (gigs.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No gigs posted yet"
        subtitle="Post your first gig to find workers"
        action="Post a Gig"
        onAction={() => window.dispatchEvent(new CustomEvent('openPostGig'))}
      />
    )
  }

  const renderGig = (gig) => (
  <PostedGigCard
    key={gig.id} gig={gig}
    status={getStatus(gig)}
    onAccept={onAccept} onDecline={onDecline}
    onDelete={onDelete} onReceipt={onReceipt}
    onEdit={onEdit} onViewProfile={onViewProfile}
    onViewApplicants={onViewApplicants}
    onTrack={onTrack}
    onRelease={onRelease}
  />
)

  return (
    <div>
      {actionGigs.length > 0 && (
        <GigCarousel
          title="Needs Action"
          count={actionGigs.length}
          color="#FF3366"
        >
          {sectionHeader('🔴 Needs Action', '#FF3366')}
          {actionGigs.map(renderGig)}
        </GigCarousel>
      )}
      {inProgressGigs.length > 0 && (
        <GigCarousel
          title="In Progress"
          count={inProgressGigs.length}
          color="#FF6B2B"
        >
          {sectionHeader('🟡 In Progress', '#FF6B2B')}
          {inProgressGigs.map(renderGig)}
        </GigCarousel>
      )}
      {openGigs.length > 0 && (
        <GigCarousel title="Open" count={openGigs.length} color="#00C48C">
          {sectionHeader('🟢 Open', '#00C48C')}
          {openGigs.map(renderGig)}
        </GigCarousel>
      )}
      {completedGigs.length > 0 && (
        <GigCarousel
          title="Completed"
          count={completedGigs.length}
          color="#8B8FAF"
        >
          {sectionHeader('✅ Completed', '#8B8FAF')}
          {completedGigs.map(renderGig)}
        </GigCarousel>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// POSTED GIG CARD
// ══════════════════════════════════════════
function PostedGigCard({
  gig, status, onAccept, onDecline, onDelete,
  onReceipt, onEdit, onViewProfile, onViewApplicants, onTrack, onRelease
}) {
  const [expanded, setExpanded] = useState(false)
  const receipt = gig.receipts?.[0]
  const pendingApps = gig.applications?.filter(
    a => a.status === 'pending'
  ) || []
  const acceptedApp = gig.applications?.find(a => a.status === 'accepted')
  const acceptedWorkerId = gig.worker_id || acceptedApp?.worker_id
  const acceptedWorker = gig.worker || acceptedApp?.users
  const acceptedAt = gig.accepted_at || acceptedApp?.accepted_at
  const currency = getCurrency(gig.currency || 'USD')
  const daysSinceAccepted = daysSince(acceptedAt)
  const isWalletGig = gig.payment_method === PAYMENT_METHODS.WALLET

  const statusConfig = {
    open: { color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2', label: 'Open' },
    hasapplicants: { color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3', label: `${pendingApps.length} Applicant${pendingApps.length > 1 ? 's' : ''}` },
    inprogress: { color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99', label: 'In Progress' },
    waiting: { color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF', label: 'Awaiting Confirmation' },
    completed: { color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF', label: 'Completed' },
  }

  const sc = statusConfig[status] || statusConfig.open

  return (
    <div style={{
      background: '#fff', border: `1.5px solid ${sc.border}`,
      borderRadius: '16px', marginBottom: '12px',
      overflow: 'hidden', transition: 'all 0.2s',
      minWidth: 'min(86vw, 360px)', maxWidth: '360px',
      boxShadow: '0 12px 28px rgba(20,18,58,0.08)',
      scrollSnapAlign: 'start'
    }}>
      {/* Card Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '8px'
        }}>
          <div style={{ flex: 1, paddingRight: '10px' }}>
            {/* Status badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              gap: '5px', background: sc.bg,
              border: `1px solid ${sc.border}`,
              borderRadius: '6px', padding: '3px 9px',
              fontSize: '10px', fontWeight: '800',
              color: sc.color, marginBottom: '6px',
              letterSpacing: '0.5px'
            }}>
              {status === 'hasapplicants' && (
                <span style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%', background: sc.color,
                  animation: 'blink 0.9s infinite'
                }} />
              )}
              {sc.label.toUpperCase()}
            </div>
            <div style={{
              fontSize: '17px', fontWeight: '900', color: '#14123A',
              lineHeight: 1.25
            }}>{gig.title}</div>
            <div style={{
              fontSize: '12px', color: '#6F7394', marginTop: '6px',
              fontWeight: '700', lineHeight: 1.35
            }}>
              {currency.symbol}{gig.pay_min}–{currency.symbol}{gig.pay_max} ·{' '}
              {gig.location || 'Remote'} · {timeAgo(gig.created_at)}
            </div>
          </div>
          <span style={{
            fontSize: '14px', color: '#A09DC8',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s'
          }}>▼</span>
        </div>

        {/* Worker info if in progress */}
        {(status === 'inprogress' || status === 'waiting') && acceptedWorker && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center',
            background: '#F5F4FF', borderRadius: '10px',
            padding: '8px 10px', marginTop: '6px'
          }}>
            <div
              onClick={(e) => {
                e.stopPropagation()
                onViewProfile(acceptedWorkerId)
              }}
              style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: '#EEE9FF', overflow: 'hidden',
                flexShrink: 0, cursor: 'pointer',
                border: '1.5px solid #B8A5FF',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '11px',
                fontWeight: '800', color: '#6C47FF'
              }}>
              {acceptedWorker?.avatar_url ? (
                <img src={acceptedWorker.avatar_url} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : acceptedWorker?.full_name?.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '12px', fontWeight: '600', color: '#14123A'
              }}>{acceptedWorker?.full_name}</div>
              <div style={{ fontSize: '10px', color: '#8B8FAF' }}>
                ⭐ {acceptedWorker?.rating || 5.0} · Working since {timeAgo(acceptedAt)}
              </div>
            </div>
          </div>
        )}

        {/* Applicants preview */}
        {status === 'hasapplicants' && (
          <div style={{
            display: 'flex', gap: '4px', marginTop: '8px',
            alignItems: 'center'
          }}>
            {pendingApps.slice(0, 3).map(app => (
              <div key={app.id} style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: '#EEE9FF', overflow: 'hidden',
                border: '1.5px solid #B8A5FF',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '11px',
                fontWeight: '800', color: '#6C47FF'
              }}>
                {app.users?.avatar_url ? (
                  <img src={app.users.avatar_url} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : app.users?.full_name?.charAt(0) || '?'}
              </div>
            ))}
            {pendingApps.length > 3 && (
              <div style={{
                fontSize: '11px', color: '#6C47FF',
                fontWeight: '700', marginLeft: '4px'
              }}>+{pendingApps.length - 3} more</div>
            )}
          </div>
        )}
      </div>

      {/* Action Area */}
      <div style={{
        borderTop: '1px solid #F5F4FF',
        padding: '12px 16px', background: '#FAFAFA'
      }}>

        {/* HAS APPLICANTS */}
        {status === 'hasapplicants' && (
          <button
            onClick={() => onViewApplicants(gig)}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', borderRadius: '12px', padding: '13px',
              fontSize: '14px', fontWeight: '700', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 16px rgba(108,71,255,0.35)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px'
            }}>
            👥 Review {pendingApps.length} Applicant{pendingApps.length > 1 ? 's' : ''} →
          </button>
        )}

        {/* IN PROGRESS — Receipt Upload */}
        {status === 'inprogress' && (
  <div>
    {daysSinceAccepted >= 3 && gig.payment_method !== 'wallet' && (
      <div style={{
        background: '#FFF0E8', border: '1px solid #FFBC99',
        borderRadius: '8px', padding: '8px 12px',
        fontSize: '11px', color: '#FF6B2B',
        fontWeight: '600', marginBottom: '10px',
        display: 'flex', gap: '6px', alignItems: 'center'
      }}>
        <span>⚠️</span>
        <span>
          {gig.worker?.full_name?.split(' ')[0]} has been working{' '}
          {daysSinceAccepted} days. Have you paid them?
        </span>
      </div>
    )}

    {gig.payment_method === 'wallet' ? (
      // WALLET GIG — Mark Complete to release escrow
      <div style={{
        background: '#EEE9FF', border: '1.5px solid #B8A5FF',
        borderRadius: '12px', padding: '12px', marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#6C47FF', marginBottom: '3px'
        }}>💰 Funds in Escrow</div>
        <div style={{
          fontSize: '11px', color: '#6C47FF',
          opacity: 0.8, marginBottom: '8px'
        }}>
          {getCurrency(gig.currency || 'USD').symbol}
          {Number(gig.escrow_amount || gig.pay_min).toLocaleString()} locked.
          Tap Done when {gig.worker?.full_name?.split(' ')[0]} finishes.
        </div>
        <button
  onClick={() => onReceipt(gig)}
  style={{
    width: '100%',
    background: 'linear-gradient(135deg, #00C48C, #00A878)',
    border: 'none', borderRadius: '10px', padding: '11px',
    fontSize: '13px', fontWeight: '700', color: '#fff',
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 3px 12px rgba(0,196,140,0.35)'
  }}>
  ✓ Mark Done →
</button>
      </div>
    ) : (
      // MANUAL GIG — existing receipt upload flow
      <div style={{
        background: '#EEE9FF', border: '1.5px solid #B8A5FF',
        borderRadius: '12px', padding: '12px', marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#6C47FF', marginBottom: '3px'
        }}>📎 Ready to upload receipt?</div>
        <div style={{
          fontSize: '11px', color: '#6C47FF',
          opacity: 0.8, marginBottom: '8px'
        }}>
          When you've paid {gig.worker?.full_name?.split(' ')[0]},
          confirm the payment here.
        </div>
        <button
          onClick={() => onReceipt(gig)}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '10px', padding: '11px',
            fontSize: '13px', fontWeight: '700', color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 3px 12px rgba(108,71,255,0.35)'
          }}>
          Upload Receipt →
        </button>
      </div>
    )}

    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(
          'openChatWithUser',
          { detail: { userId: gig.worker_id, gigId: gig.id } }
        ))}
        style={{
          flex: 1, background: '#F5F4FF',
          border: '1.5px solid #E2E0FF',
          borderRadius: '10px', padding: '10px',
          fontSize: '12px', fontWeight: '700',
          color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '5px'
        }}>
        <BrandIcon name="chat" size={18} active /> Message
      </button>
      {gig.type === 'physical' && (
        <button
          onClick={() => onTrack(gig)}
          style={{
            flex: 1, background: '#FFF0E8',
            border: '1.5px solid #FFBC99',
            borderRadius: '10px', padding: '10px',
            fontSize: '12px', fontWeight: '700',
            color: '#FF6B2B', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '5px'
          }}>
          <BrandIcon name="location" size={18} active /> Track
        </button>
      )}
    </div>
  </div>
)}
        {/* WAITING FOR WORKER CONFIRMATION */}
        {status === 'waiting' && (
          <div>
            <div style={{
              background: '#EEE9FF', border: '1.5px solid #B8A5FF',
              borderRadius: '12px', padding: '14px',
              marginBottom: '10px'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                marginBottom: '6px'
              }}>
                <BrandIcon name="receipt" size={28} active />
                <div>
                  <div style={{
                    fontSize: '12px', fontWeight: '700', color: '#6C47FF'
                  }}>
                    Waiting for {acceptedWorker?.full_name?.split(' ')[0]} to confirm
                  </div>
                  <div style={{ fontSize: '11px', color: '#6C47FF', opacity: 0.8 }}>
                    You confirmed {getCurrency(receipt?.currency || 'USD').symbol}
                    {receipt?.amount?.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(
                'openChatWithUser',
                { detail: { userId: acceptedWorkerId, gigId: gig.id } }
              ))}
              style={{
                width: '100%', background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '5px'
              }}>
              <BrandIcon name="chat" size={18} active />
              Message {acceptedWorker?.full_name?.split(' ')[0]}
            </button>
          </div>
        )}

        {/* ACTIONS */}
        {['open', 'hasapplicants', 'waiting', 'inprogress'].includes(status) && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={() => onEdit(gig)}
              style={{
                flex: 1, background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '5px'
              }}>
              <BrandIcon name="edit" size={18} active={false} /> Edit
            </button>
            <button
              onClick={() => onDelete(gig.id)}
              style={{
                background: '#FFE8EE',
                border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 14px',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center'
              }}>
              <span style={{ fontSize: '16px', lineHeight: 1 }}>🗑</span>
            </button>
          </div>
        )}

        {/* COMPLETED */}
        {status === 'completed' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: '#00C48C', fontWeight: '600'
          }}>
            <BrandIcon name="completed" size={20} active />
            {getCurrency(receipt?.currency || 'USD').symbol}
            {receipt?.amount?.toLocaleString()} · Completed
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════
// WORKING TAB
// ══════════════════════════════════════════
function WorkingTab({
  applications, getStatus, pendingCommissions, totalOwed,
  onReceipt, onViewProfile, onTrack, onRefresh,
  sectionHeader, userId
}) {
  const actionApps = applications.filter(a => getStatus(a) === 'confirmreceipt')
  const inProgressApps = applications.filter(a => getStatus(a) === 'inprogress')
  const pendingApps = applications.filter(a => getStatus(a) === 'pending')
  const completedApps = applications.filter(a => getStatus(a) === 'completed')

  if (applications.length === 0) {
    return (
      <EmptyState
        icon="⚡"
        title="No applications yet"
        subtitle="Browse gigs on the Feed or Map and apply"
        action="Browse Gigs"
        onAction={() => window.dispatchEvent(
          new CustomEvent('navigateTo', { detail: 'feed' })
        )}
      />
    )
  }

  const renderApp = (app) => (
    <WorkingGigCard
      key={app.id}
      application={app}
      status={getStatus(app)}
      commission={pendingCommissions.find(c => c.gig_id === app.gigs?.id)}
      onReceipt={onReceipt}
      onViewProfile={onViewProfile}
      onTrack={onTrack}
    />
  )

  return (
    <div>
      {/* Commission warning */}
      {pendingCommissions.length > 0 && (
        <div
          onClick={() => window.dispatchEvent(
            new CustomEvent('navigateTo', { detail: 'commission' })
          )}
          style={{
            background: '#FFE8EE', border: '1.5px solid #FF99B3',
            borderRadius: '14px', padding: '12px 16px',
            marginTop: '12px', marginBottom: '4px',
            cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center'
          }}>
          <div>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: '#FF3366'
            }}>💰 Commission due</div>
            <div style={{
              fontSize: '11px', color: '#FF3366', opacity: 0.8
            }}>
              {pendingCommissions.length} pending · Pay to maintain account
            </div>
          </div>
          <div style={{
            background: '#FF3366', color: '#fff',
            borderRadius: '8px', padding: '6px 12px',
            fontSize: '12px', fontWeight: '700'
          }}>Pay Now →</div>
        </div>
      )}

      {actionApps.length > 0 && (
        <GigCarousel
          title="Action Required"
          count={actionApps.length}
          color="#FF3366"
        >
          {sectionHeader('🔴 Action Required', '#FF3366')}
          {actionApps.map(renderApp)}
        </GigCarousel>
      )}
      {inProgressApps.length > 0 && (
        <GigCarousel
          title="In Progress"
          count={inProgressApps.length}
          color="#FF6B2B"
        >
          {sectionHeader('🟡 In Progress', '#FF6B2B')}
          {inProgressApps.map(renderApp)}
        </GigCarousel>
      )}
      {pendingApps.length > 0 && (
        <GigCarousel title="Pending" count={pendingApps.length} color="#6C47FF">
          {sectionHeader('🔵 Pending', '#6C47FF')}
          {pendingApps.map(renderApp)}
        </GigCarousel>
      )}
      {completedApps.length > 0 && (
        <GigCarousel
          title="Completed"
          count={completedApps.length}
          color="#8B8FAF"
        >
          {sectionHeader('✅ Completed', '#8B8FAF')}
          {completedApps.map(renderApp)}
        </GigCarousel>
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// WORKING GIG CARD
// ══════════════════════════════════════════
function WorkingGigCard({
  application, status, commission,
  onReceipt, onViewProfile, onTrack
}) {
  const gig = application.gigs
  const receipt = gig?.receipts?.[0]
  const currency = getCurrency(receipt?.currency || gig?.currency || 'USD')
  const poster = gig?.poster
  const isWalletGig = gig?.payment_method === PAYMENT_METHODS.WALLET

  const statusConfig = {
    pending: { color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF', label: 'Applied' },
    inprogress: { color: '#FF6B2B', bg: '#FFF0E8', border: '#FFBC99', label: '🎉 You Got This Job!' },
    confirmreceipt: { color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3', label: '⚡ Action Required' },
    completed: { color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2', label: '✅ Completed' },
    declined: { color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF', label: 'Not Selected' },
  }

  const sc = statusConfig[status] || statusConfig.pending

  return (
    <div style={{
      background: '#fff', border: `1.5px solid ${sc.border}`,
      borderRadius: '16px', marginBottom: '12px',
      overflow: 'hidden',
      minWidth: 'min(86vw, 360px)', maxWidth: '360px',
      boxShadow: '0 12px 28px rgba(20,18,58,0.08)',
      scrollSnapAlign: 'start'
    }}>
      {/* Card Header */}
      <div style={{ padding: '14px 16px' }}>
        {/* Status */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          gap: '5px', background: sc.bg,
          border: `1px solid ${sc.border}`,
          borderRadius: '6px', padding: '3px 9px',
          fontSize: '10px', fontWeight: '800',
          color: sc.color, marginBottom: '8px',
          letterSpacing: '0.5px'
        }}>
          {status === 'confirmreceipt' && (
            <span style={{
              width: '6px', height: '6px',
              borderRadius: '50%', background: sc.color,
              animation: 'blink 0.9s infinite'
            }} />
          )}
          {sc.label.toUpperCase()}
        </div>

        <div style={{
          fontSize: '17px', fontWeight: '900',
          color: '#14123A', marginBottom: '8px',
          lineHeight: 1.25
        }}>{gig?.title}</div>

        {/* Poster info */}
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'center',
          marginBottom: '4px'
        }}>
          <div
            onClick={() => onViewProfile(gig?.poster_id)}
            style={{
              width: '24px', height: '24px', borderRadius: '6px',
              background: '#EEE9FF', overflow: 'hidden',
              flexShrink: 0, cursor: 'pointer',
              border: '1px solid #B8A5FF',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '10px',
              fontWeight: '800', color: '#6C47FF'
            }}>
            {poster?.avatar_url ? (
              <img src={poster.avatar_url} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : poster?.full_name?.charAt(0) || '?'}
          </div>
          <span style={{ fontSize: '12px', color: '#8B8FAF' }}>
            {poster?.full_name || 'Poster'}
          </span>
          <span style={{ fontSize: '11px', color: '#A09DC8' }}>·</span>
          <span style={{ fontSize: '12px', color: '#8B8FAF' }}>
            {gig?.location || 'Remote'}
          </span>
        </div>

        <div style={{
          fontSize: '15px', color: '#008E66',
          fontWeight: '900', marginTop: '8px'
        }}>
          {getCurrency(gig?.currency || 'USD').symbol}
          {gig?.pay_min}–{getCurrency(gig?.currency || 'USD').symbol}
          {gig?.pay_max}
        </div>
      </div>

      {/* Action Area */}
      <div style={{
        borderTop: '1px solid #F5F4FF',
        padding: '12px 16px', background: '#FAFAFA'
      }}>

        {/* PENDING */}
        {status === 'pending' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: '12px', color: '#8B8FAF' }}>
              Waiting for a response · Applied {timeAgo(application.created_at)}
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(
                'openChatWithUser',
                { detail: { userId: gig?.poster_id, gigId: gig?.id } }
              ))}
              style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '8px', padding: '8px 12px',
                fontSize: '12px', fontWeight: '700',
                color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}>
              <BrandIcon name="chat" size={18} active /> Message
            </button>
          </div>
        )}

        {/* IN PROGRESS */}
        {status === 'inprogress' && (
          <div>
            <div style={{
              background: '#DFFDF4', border: '1px solid #7EECD2',
              borderRadius: '10px', padding: '10px 12px',
              marginBottom: '10px', fontSize: '12px',
              color: '#00C48C', fontWeight: '600'
            }}>
              You've been accepted! Do the work and wait for{' '}
              {poster?.full_name?.split(' ')[0] || 'the poster'} to confirm {isWalletGig ? 'completion' : 'payment'}.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent(
                  'openChatWithUser',
                  { detail: { userId: gig?.poster_id, gigId: gig?.id } }
                ))}
                style={{
                  flex: 1, background: '#F5F4FF',
                  border: '1.5px solid #E2E0FF',
                  borderRadius: '10px', padding: '10px',
                  fontSize: '12px', fontWeight: '700',
                  color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '5px'
                }}>
                <BrandIcon name="chat" size={18} active /> Message
              </button>
              {gig?.type === 'physical' && (
                <button
                  onClick={() => onTrack(gig)}
                  style={{
                    flex: 1, background: '#FFF0E8',
                    border: '1.5px solid #FFBC99',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: '#FF6B2B', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '5px'
                  }}>
                  <BrandIcon name="location" size={18} active /> Directions
                </button>
              )}
            </div>
          </div>
        )}

        {/* CONFIRM RECEIPT */}
        {status === 'confirmreceipt' && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, #FFF0E8, #FFE8EE)',
              border: '1.5px solid #FF99B3',
              borderRadius: '12px', padding: '14px',
              marginBottom: '10px'
            }}>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: '#FF6B2B',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                marginBottom: '6px'
              }}>
                {poster?.full_name?.split(' ')[0] || 'Poster'} confirmed your payment
              </div>
              <div style={{
                fontSize: '28px', fontWeight: '800',
                color: '#14123A', lineHeight: 1, marginBottom: '2px'
              }}>
                {currency.symbol}{receipt?.amount?.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: '#8B8FAF' }}>
                {receipt?.currency || 'USD'} · Is this what you received?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => onReceipt(gig)}
                style={{
                  flex: 1, background: '#FFE8EE',
                  border: '1.5px solid #FF99B3',
                  borderRadius: '10px', padding: '12px',
                  fontSize: '12px', fontWeight: '700',
                  color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
                }}>✗ Dispute</button>
              <button
                onClick={() => onReceipt(gig)}
                style={{
                  flex: 2,
                  background: 'linear-gradient(135deg, #00C48C, #00A878)',
                  border: 'none', borderRadius: '10px', padding: '12px',
                  fontSize: '13px', fontWeight: '700', color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 3px 12px rgba(0,196,140,0.35)'
                }}>✓ Confirm & Complete →</button>
            </div>
          </div>
        )}

        {/* COMPLETED */}
        {status === 'completed' && (
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: commission ? '10px' : '0'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', color: '#00C48C', fontWeight: '700'
              }}>
                <BrandIcon name="completed" size={20} active />
                Earned {currency.symbol}{receipt?.amount?.toLocaleString() || gig?.pay_max}
              </div>
              <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                {timeAgo(application.accepted_at)}
              </div>
            </div>

            {/* Commission status */}
            {commission && (
              <div style={{
                background: 'linear-gradient(135deg, #FFE8EE, #FFF0E8)',
                border: '1.5px solid #FF99B3',
                borderRadius: '12px', padding: '12px 14px',
                marginTop: '10px'
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: '10px'
                }}>
                  <div>
                    <div style={{
                      fontSize: '11px', fontWeight: '700',
                      color: '#FF6B2B', textTransform: 'uppercase',
                      letterSpacing: '0.8px', marginBottom: '3px'
                    }}>Platform Commission Due</div>
                    <div style={{
                      fontSize: '22px', fontWeight: '800', color: '#FF3366'
                    }}>
                      {getCurrency(commission.currency || 'USD').symbol}
                      {commission.commission_amount?.toLocaleString()}
                    </div>
                  </div>
                  <BrandIcon name="commission" size={34} active />
                </div>
                <button
                  onClick={() => window.dispatchEvent(
                    new CustomEvent('navigateTo', { detail: 'commission' })
                  )}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #FF3366, #FF6B2B)',
                    color: '#fff', border: 'none', borderRadius: '10px',
                    padding: '11px', fontSize: '13px', fontWeight: '700',
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 3px 12px rgba(255,51,102,0.35)'
                  }}>Pay Commission Now →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// APPLICANTS SHEET
// ══════════════════════════════════════════
function ApplicantsSheet({
  gig, onClose, onAccept, onDecline, onViewProfile
}) {
  const pendingApps = gig.applications?.filter(
    a => a.status === 'pending'
  ) || []

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
        background: '#fff', borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        maxHeight: '85vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '12px auto 0'
        }} />
        <div style={{ padding: '20px' }}>
          <div style={{
            fontSize: '18px', fontWeight: '800',
            color: '#14123A', marginBottom: '4px'
          }}>Applicants</div>
          <div style={{
            fontSize: '13px', color: '#8B8FAF',
            marginBottom: '20px'
          }}>
            {pendingApps.length} people applied for "{gig.title}"
          </div>

          {pendingApps.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px',
              color: '#A09DC8'
            }}>No pending applicants</div>
          ) : pendingApps.map((app, i) => (
            <div key={app.id} style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '14px', padding: '14px',
              marginBottom: '10px'
            }}>
              {/* Applicant info */}
              <div style={{
                display: 'flex', gap: '10px',
                alignItems: 'center', marginBottom: '12px'
              }}>
                <div
                  onClick={() => onViewProfile(app.worker_id)}
                  style={{
                    width: '44px', height: '44px',
                    borderRadius: '12px', background: '#EEE9FF',
                    overflow: 'hidden', flexShrink: 0,
                    cursor: 'pointer', border: '2px solid #B8A5FF',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px',
                    fontWeight: '800', color: '#6C47FF'
                  }}>
                  {app.users?.avatar_url ? (
                    <img src={app.users.avatar_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : app.users?.full_name?.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    onClick={() => onViewProfile(app.worker_id)}
                    style={{
                      fontSize: '14px', fontWeight: '700',
                      color: '#6C47FF', cursor: 'pointer',
                      marginBottom: '2px'
                    }}>
                    {app.users?.full_name || 'Unknown'} →
                  </div>
                  <div style={{
                    fontSize: '11px', color: '#8B8FAF'
                  }}>
                    ⭐ {app.users?.rating || 5.0} ·
                    Trust {app.users?.trust_score || 100}% ·
                    {app.users?.level || 'New'}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent(
                    'openChatWithUser',
                    { detail: { userId: app.worker_id, gigId: gig.id } }
                  ))}
                  style={{
                    flex: 1, background: '#fff',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: '#6C47FF', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>💬 Chat</button>
                <button
                  onClick={() => onDecline(app)}
                  style={{
                    flex: 1, background: '#FFE8EE',
                    border: '1.5px solid #FF99B3',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: '#FF3366', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>✗ Decline</button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onAccept(app)
                  }}
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, #00C48C, #00A878)',
                    border: 'none', borderRadius: '10px', padding: '10px',
                    fontSize: '13px', fontWeight: '700', color: '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 3px 12px rgba(0,196,140,0.3)'
                  }}>✓ Accept</button>
              </div>
            </div>
          ))}
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

// ══════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════
function HeaderStat({ label, value, color }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #E2E0FF',
      borderRadius: '14px', padding: '10px 8px',
      boxShadow: '0 8px 18px rgba(20,18,58,0.05)'
    }}>
      <div style={{
        fontSize: '20px', fontWeight: '900',
        color, lineHeight: 1, marginBottom: '4px'
      }}>{value}</div>
      <div style={{
        fontSize: '10px', color: '#6F7394',
        fontWeight: '850', textTransform: 'uppercase',
        letterSpacing: '0.7px'
      }}>{label}</div>
    </div>
  )
}

function GigCarousel({ title, count, color, children }) {
  return (
    <section style={{ marginTop: '16px' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '12px',
        marginBottom: '10px'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: '8px', minWidth: 0
        }}>
          <span style={{
            width: '10px', height: '10px',
            borderRadius: '50%', background: color,
            boxShadow: `0 0 0 4px ${color}22`,
            flexShrink: 0
          }} />
          <h2 style={{
            margin: 0, fontSize: '15px',
            fontWeight: '900', color: '#14123A',
            lineHeight: 1.15
          }}>{title}</h2>
        </div>
        <span style={{
          background: '#fff', border: `1.5px solid ${color}44`,
          color, borderRadius: '999px', padding: '5px 9px',
          fontSize: '11px', fontWeight: '900',
          flexShrink: 0
        }}>
          {count}
        </span>
      </div>
      <div style={{
        display: 'flex', gap: '12px',
        overflowX: 'auto', overflowY: 'hidden',
        scrollSnapType: 'x proximity',
        WebkitOverflowScrolling: 'touch',
        padding: '2px 4px 8px 0'
      }}>
        {children}
      </div>
    </section>
  )
}

function EmptyState({ icon, title, subtitle, action, onAction }) {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 20px',
      background: '#fff', borderRadius: '20px',
      border: '1.5px solid #E2E0FF', marginTop: '16px'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '14px' }}>{icon}</div>
      <div style={{
        fontSize: '16px', fontWeight: '700',
        color: '#14123A', marginBottom: '6px'
      }}>{title}</div>
      <div style={{
        fontSize: '13px', color: '#A09DC8',
        lineHeight: '1.6', marginBottom: action ? '20px' : '0'
      }}>{subtitle}</div>
      {action && onAction && (
        <button
          onClick={onAction}
          style={{
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '12px',
            padding: '12px 24px', fontSize: '13px',
            fontWeight: '700', color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 16px rgba(108,71,255,0.35)'
          }}>{action}</button>
      )}
    </div>
  )
}
