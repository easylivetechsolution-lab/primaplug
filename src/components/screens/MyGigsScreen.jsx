import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { useCredits } from '../../context/CreditsContext'
import { getCurrency } from '../../data/currencies'
import { showToast } from '../../utils/toast'
import PublicProfile from '../PublicProfile'
import { getPendingGigReferralForPayout } from '../../utils/referral'
import { updateWorkerLevel } from '../../utils/workerLevel'
import ReceiptFlow from '../ReceiptFlow'
import { parseTimestamp } from '../../utils/time'
import ScreenLoader from '../ScreenLoader'
import LiveTracking from '../LiveTracking'
import EditGig from '../EditGig'
import BrandIcon from '../BrandIcon'
import { sendPushToUser } from '../../utils/pushNotifications'
import { PAYMENT_METHODS } from '../../utils/payments'
import ConfirmDialog from '../ConfirmDialog'

// ─── CONSTANTS ───────────────────────────────────────
const TABS = [
  { key: 'myposts', icon: 'mygigs', label: 'Posted by Me', sub: 'Manage applicants and payments' },
  { key: 'myjobs', icon: 'applied', label: 'My Work', sub: 'Track applications and jobs' },
]

// ─── HELPERS ─────────────────────────────────────────
const timeAgo = (date) => {
  if (!date) return ''
  const s = Math.floor((new Date() - parseTimestamp(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const daysSince = (date) => {
  if (!date) return 0
  return Math.floor((new Date() - parseTimestamp(date)) / (1000 * 60 * 60 * 24))
}

const timeUntil = (d) => {
  const diff = parseTimestamp(d) - Date.now()
  if (diff <= 0) return null
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  return days === 1 ? '1 day' : `${days} days`
}

const ExpiryBadge = ({ expiresAt }) => {
  if (!expiresAt) return null
  const remaining = timeUntil(expiresAt)
  if (!remaining) return <span style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: '700' }}>Expired</span>
  const isUrgent = parseTimestamp(expiresAt) - Date.now() < 24 * 60 * 60 * 1000
  const isWarning = parseTimestamp(expiresAt) - Date.now() < 3 * 24 * 60 * 60 * 1000
  const color = isUrgent ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-text-subtle)'
  const bg = isUrgent ? 'var(--color-danger-soft)' : isWarning ? 'var(--color-warning-soft)' : 'var(--color-page)'
  const border = isUrgent ? 'var(--color-danger-border)' : isWarning ? 'var(--color-warning-border)' : 'var(--color-border)'
  return (
    <span style={{
      fontSize: '12px', fontWeight: '700', color,
      background: bg, border: `1px solid ${border}`,
      borderRadius: '5px', padding: '1px 6px',
      display: 'inline-flex', alignItems: 'center', gap: '3px',
    }}>
      {remaining} left
    </span>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────
export default function MyGigsScreen() {
  const { user, profile } = useAuth()
  const { pendingCommissions, totalOwed } = useCredits()

  const [tab, setTab] = useState('myposts')
  const [statusFilter, setStatusFilter] = useState('all')

  const [postedGigs, setPostedGigs] = useState([])
  const [workingGigs, setWorkingGigs] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showActions, setShowActions] = useState(false)
  const [pendingNotificationTarget, setPendingNotificationTarget] = useState(null)

  // Modals
  const [receiptGig, setReceiptGig] = useState(null)

  const [trackingGig, setTrackingGig] = useState(null)
  const [editingGig, setEditingGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applicantsGig, setApplicantsGig] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  useEffect(() => {
    if (user) {
      fetchAll()
      return subscribeToUpdates()
    }
  }, [user])

  useEffect(() => {
    const handleNotificationTarget = (event) => setPendingNotificationTarget(event.detail || null)
    window.addEventListener('openMyGigNotification', handleNotificationTarget)
    return () => window.removeEventListener('openMyGigNotification', handleNotificationTarget)
  }, [])

  useEffect(() => {
    if (!pendingNotificationTarget || loading) return
    const { gigId, action, side } = pendingNotificationTarget
    const postedGig = postedGigs.find(gig => gig.id === gigId)
    const workingApplication = workingGigs.find(application => application.gigs?.id === gigId)
    const workingGig = workingApplication?.gigs

    setStatusFilter(action === 'applicants' ? 'action' : 'all')
    if (action === 'applicants' && postedGig) {
      setTab('myposts')
      setApplicantsGig(postedGig)
    } else if (action === 'receipt' && side === 'worker' && workingGig) {
      setTab('myjobs')
      setReceiptGig(workingGig)
    } else if (action === 'receipt' && postedGig) {
      setTab('myposts')
      setReceiptGig(postedGig)
    } else if (postedGig || workingGig) {
      setTab(postedGig ? 'myposts' : 'myjobs')
    }
    setPendingNotificationTarget(null)
  }, [pendingNotificationTarget, loading, postedGigs, workingGigs])

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
      .is('deleted_at', null)
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
      const valid = data.filter(a => a.gigs && !a.gigs.deleted_at)
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
            p_amount: escrowAmount,
            p_currency: gig.currency || 'NGN'
          })

        if (lockError) throw lockError

        if (!lockResult) {
          showToast('Your wallet balance is not enough to accept this worker. Please fund your wallet or use a manual-payment gig.', 'error')
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

      const { data: acceptedApps } = await supabase
        .from('applications')
        .select('id')
        .eq('gig_id', gig.id)
        .eq('status', 'accepted')

      const filled = acceptedApps?.length || 1
      const slots = Number(gig.slots || 1)
      const slotsFull = slots <= 1 || filled >= slots

      // Update gig with worker_id (also lock escrow_amount for wallet gigs)
      const { error: gigError } = await supabase
        .from('gigs')
        .update({
          status: slotsFull ? 'in_progress' : 'open',
          worker_id: application.worker_id,
          worker_name: application.users?.full_name,
          accepted_at: new Date().toISOString(),
          slots_filled: filled,
          ...(isWalletGig ? { escrow_amount: Number(gig.pay_min) } : {})
        })
        .eq('id', gig.id)

      if (gigError) throw gigError

      // Notify accepted worker
      // Check if this gig has a pending referral, to inform the worker
const gigReferral = await getPendingGigReferralForPayout(gig.id, application.worker_id)
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

      // Decline other pending applications only when the gig has no more slots.
      const otherPendingApps = gig.applications?.filter(
        a => a.id !== application.id && a.status === 'pending'
      ) || []

      if (slotsFull && otherPendingApps.length > 0) {
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
      showToast(isWalletGig
        ? 'Application accepted! Funds are now locked in escrow.'
        : 'Application accepted! Worker has been notified.')

    } catch (e) {
      console.error('Accept error:', e)
      showToast('Error accepting: ' + e.message, 'error')
    }
  }

  const releaseEscrow = async (gig) => {
  try {
    const amount = Number(gig.escrow_amount || gig.pay_min)
    const referral = await getPendingGigReferralForPayout(gig.id, gig.worker_id)

    if (referral) {
      const referrerShare = amount * 0.05
      const { error } = await supabase.rpc('release_gig_escrow_with_referral', {
        p_gig_id: gig.id,
        p_poster_id: gig.poster_id,
        p_worker_id: gig.worker_id,
        p_amount: amount,
        p_referrer_id: referral.referrer_id,
        p_referrer_share: referrerShare,
        p_currency: gig.currency || 'NGN'
      })

      if (error) throw error

      await supabase
        .from('gig_referrals')
        .update({
          status: 'completed',
          reward_given: true,
          gig_amount: amount,
          reward_amount: referrerShare,
          reward_currency: gig.currency,
          completed_at: new Date().toISOString()
        })
        .eq('id', referral.id)

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
        p_amount: amount,
        p_currency: gig.currency || 'NGN'
      })

      if (error) throw error
    }
      // Mark gig completed
      await supabase
        .from('gigs')
        .update({ status: 'completed' })
        .eq('id', gig.id)

      await supabase.rpc('increment_gigs_completed', { worker_id: gig.worker_id })
      await updateWorkerLevel(gig.worker_id)

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
      showToast('Error releasing payment: ' + e.message, 'error')
    }
  }
  const declineApplication = async (application, gigTitle, gigId) => {
    await supabase
      .from('applications')
      .update({ status: 'declined' })
      .eq('id', application.id)

    await supabase.from('notifications').insert({
      user_id: application.worker_id,
      title: 'Application Update',
      message: `Your application for "${gigTitle}" was not selected.`,
      type: 'rejected',
      gig_id: gigId || null
    })

    try {
      await sendPushToUser(
        application.worker_id,
        'Application Update',
        `Your application for "${gigTitle}" was not selected.`,
        { type: 'rejected', gigId: gigId || null }
      )
    } catch (e) {
      console.log('Push error:', e)
    }

    await fetchAll()
  }

  const deleteGig = async (gigId, confirmed = false) => {
    if (!confirmed) {
      setConfirmDialog({
        title: 'Delete this gig?', message: 'This cannot be undone. Any pending applicants will be notified.',
        confirmLabel: 'Delete gig', action: () => deleteGig(gigId, true)
      })
      return
    }

    const { data: current } = await supabase
      .from('gigs')
      .select('status, expires_at, applications(id, status)')
      .eq('id', gigId)
      .maybeSingle()

    if (!current) return

    // Always block if a worker is actively on the job, regardless of expiry
    if (current.status === 'in_progress') {
      showToast('A worker is actively on this job. Complete or resolve it before deleting.', 'error')
      return
    }

    // Block if there is an accepted application and the gig is not expired or completed
    const isExpired = current.expires_at && parseTimestamp(current.expires_at) < new Date()
    const isCompleted = current.status === 'completed'
    const hasAccepted = current.applications?.some(a => a.status === 'accepted')
    if (hasAccepted && !isExpired && !isCompleted) {
      showToast('A worker has been accepted for this gig. Complete or resolve it before deleting.', 'error')
      return
    }

    // Notify pending applicants
    const pendingApps = current.applications?.filter(a => a.status === 'pending') || []
    if (pendingApps.length > 0) {
      await supabase.from('notifications').insert(
        pendingApps.map(a => ({
          user_id: a.worker_id,
          title: 'Gig Removed',
          message: 'A gig you applied for has been removed by the poster.',
          type: 'rejected',
          gig_id: null
        }))
      )
    }

    const { error } = await supabase
      .from('gigs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', gigId)
    if (error) showToast('Failed to delete gig: ' + error.message, 'error')
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
    if (gig.expires_at && parseTimestamp(gig.expires_at) < new Date()) return 'expired'
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
  const activeTabActionCount = tab === 'myposts' ? postedActionCount : workingActionCount
  const activeTabTotal = tab === 'myposts' ? postedGigs.length : workingGigs.length
  const activeTabInProgress = tab === 'myposts' ? postedInProgressCount : workingInProgressCount
  const activeTabDescription = tab === 'myposts'
    ? 'Work you created, applicants to review, and payment completion.'
    : 'Applications, accepted jobs, receipts, and completed work.'
  const statusFilters = tab === 'myposts'
    ? [
        { key: 'all', label: 'All', count: postedGigs.length },
        { key: 'action', label: 'Needs Action', count: postedActionCount },
        { key: 'inprogress', label: 'In Progress', count: postedInProgressCount },
        { key: 'open', label: 'Open', count: postedGigs.filter(g => getPostedGigStatus(g) === 'open').length },
        { key: 'completed', label: 'Completed', count: postedGigs.filter(g => getPostedGigStatus(g) === 'completed').length },
        { key: 'expired', label: 'Expired', count: postedGigs.filter(g => getPostedGigStatus(g) === 'expired').length },
      ]
    : [
        { key: 'all', label: 'All', count: workingGigs.length },
        { key: 'action', label: 'Needs Action', count: workingGigs.filter(a => getWorkingGigStatus(a) === 'confirmreceipt').length + pendingCommissions.length },
        { key: 'inprogress', label: 'In Progress', count: workingInProgressCount },
        { key: 'pending', label: 'Applied', count: workingGigs.filter(a => getWorkingGigStatus(a) === 'pending').length },
        { key: 'completed', label: 'Completed', count: workingGigs.filter(a => getWorkingGigStatus(a) === 'completed').length },
      ]

  // ─── STYLES ────────────────────────────────────────

  const sectionHeader = () => null

  // ─── RENDER ────────────────────────────────────────

  return (
    <div className="my-gigs-screen" style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: 'var(--color-surface-tint)'
    }}>
      {/* Header */}
      <div className="my-gigs-header" style={{
        background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-tint) 100%)',
        padding: '8px 16px 0',
        borderBottom: '1.5px solid var(--color-border)', flexShrink: 0,
        boxShadow: '0 10px 30px rgba(20,18,58,0.06)'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '12px', marginBottom: '6px'
        }}>
          <div>
            <div style={{
              fontSize: '20px', fontWeight: '900', color: 'var(--color-text)',
              lineHeight: 1.05
            }}>My Gigs</div>
            <div style={{
              fontSize: '12px', color: 'var(--color-text-muted)',
              fontWeight: '650', marginTop: '3px',
              lineHeight: 1.2
            }}>
              {activeTabDescription}
            </div>
          </div>
          <div style={{
            background: activeTabActionCount > 0 ? 'var(--color-danger)' : 'var(--color-text)',
            color: 'var(--color-surface)',
            borderRadius: '13px', padding: '8px 11px',
            minWidth: '64px', textAlign: 'center',
            boxShadow: activeTabActionCount > 0
              ? '0 10px 22px rgba(255,51,102,0.18)'
              : '0 10px 22px rgba(20,18,58,0.16)'
          }}>
            <div style={{ fontSize: '20px', fontWeight: '900', lineHeight: 1 }}>
              {activeTabActionCount}
            </div>
            <div style={{
              fontSize: '12px', fontWeight: '800',
              color: 'var(--color-surface)', opacity: 0.82, textTransform: 'uppercase',
              letterSpacing: '0.5px', marginTop: '3px'
            }}>
              To Do
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '8px', marginBottom: '6px'
        }}>
          <HeaderStat label={tab === 'myposts' ? 'Posted' : 'Applied'} value={activeTabTotal} color="var(--color-brand)" />
          <HeaderStat label="In Progress" value={activeTabInProgress} color="var(--color-warning)" />
          <HeaderStat label="Needs Action" value={activeTabActionCount} color="var(--color-danger)" />
        </div>

        {/* Smart Action Banner */}
        {totalActionCount > 0 && (
          <div
            onClick={() => setShowActions(s => !s)}
            style={{
              background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
              borderRadius: '12px', padding: '7px 12px',
              marginBottom: '8px', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center'
            }}>
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'center'
            }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: 'var(--color-danger)', color: 'var(--color-surface)',
                fontSize: '12px', fontWeight: '800',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0
              }}>{totalActionCount}</div>
              <div style={{
                fontSize: '12px', fontWeight: '800', color: 'var(--color-danger)'
              }}>
                {totalActionCount} thing{totalActionCount > 1 ? 's' : ''} need your attention
              </div>
            </div>
            <span style={{
              fontSize: '13px', color: 'var(--color-danger)',
              fontWeight: '600'
            }}>{showActions ? '▲' : '▼'}</span>
          </div>
        )}

        {/* Expanded Action List */}
        {showActions && totalActionCount > 0 && (
          <div style={{
            background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
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
                    ? '1px solid var(--color-page)' : 'none',
                  cursor: 'pointer', borderRadius: '8px',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e =>
                  e.currentTarget.style.background = 'var(--color-page)'}
                onMouseLeave={e =>
                  e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: action.priority <= 2 ? 'var(--color-danger)'
                    : action.priority <= 4 ? 'var(--color-warning)' : 'var(--color-brand)',
                  flexShrink: 0
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '12px', fontWeight: '700',
                    color: 'var(--color-text)', marginBottom: '1px'
                  }}>{action.title}</div>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-text-muted)'
                  }}>{action.gig_title}</div>
                </div>
                <span style={{
                  fontSize: '12px', color: 'var(--color-text-subtle)'
                }}>→</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '8px',
          paddingBottom: '6px'
        }}>
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
                onClick={() => { setTab(t.key); setStatusFilter('all') }}
                style={{
                  background: active ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                  border: `1.5px solid ${active ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                  borderRadius: '13px',
                  padding: '7px 10px', cursor: 'pointer',
                  fontFamily: 'inherit', position: 'relative',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: '9px',
                  textAlign: 'left',
                  boxShadow: active ? '0 8px 18px rgba(108,71,255,0.12)' : 'none'
                }}>
                <BrandIcon name={t.icon} size={23} active={active} />
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block',
                    fontSize: '12px', fontWeight: active ? '900' : '800',
                    color: active ? 'var(--color-brand)' : 'var(--color-text)',
                    lineHeight: 1.1
                  }}>{t.label}</span>
                  <span style={{
                    display: 'block',
                    fontSize: '12px', fontWeight: '700',
                    color: 'var(--color-text-muted)',
                    marginTop: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>{t.sub}</span>
                </span>
                {badge > 0 && (
                  <span style={{
                    position: 'absolute', top: '6px', right: '8px',
                    background: 'var(--color-danger)', color: 'var(--color-surface)',
                    borderRadius: '50%', width: '16px', height: '16px',
                    fontSize: '12px', fontWeight: '800',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center'
                  }}>{badge}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="my-gig-status-tabs" role="tablist" aria-label={`${tab === 'myposts' ? 'Posted gigs' : 'My work'} status`}>
          {statusFilters.map(filter => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.key}
              className={statusFilter === filter.key ? 'active' : ''}
              onClick={() => setStatusFilter(filter.key)}
            >
              <span>{filter.label}</span>
              <span className="my-gig-status-count">{filter.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 14px 100px'
      }}>
        {loading ? (
          <ScreenLoader />
        ) : (
          <>
            {/* ── MY POSTS TAB ── */}
            {tab === 'myposts' && (
              <PostedTab
  statusFilter={statusFilter}
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
                statusFilter={statusFilter}
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
            declineApplication(app, applicantsGig.title, applicantsGig.id)
            setApplicantsGig(null)
          }}
          onViewProfile={setViewingProfile}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => { const action = confirmDialog.action; setConfirmDialog(null); action() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// POSTED TAB
// ══════════════════════════════════════════
function PostedTab({
  statusFilter, gigs, getStatus, onAccept, onDecline, onDelete,
  onReceipt, onEdit, onViewProfile, onViewApplicants,
  onTrack, onRelease, onRefresh, sectionHeader, userId
}) {
  const actionGigs = gigs.filter(g =>
    ['hasapplicants', 'waiting'].includes(getStatus(g))
  )
  const inProgressGigs = gigs.filter(g => getStatus(g) === 'inprogress')
  const openGigs = gigs.filter(g => getStatus(g) === 'open')
  const expiredGigs = gigs.filter(g => getStatus(g) === 'expired')
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

  const hasFilteredGigs = statusFilter === 'all' ||
    (statusFilter === 'action' && actionGigs.length > 0) ||
    (statusFilter === 'inprogress' && inProgressGigs.length > 0) ||
    (statusFilter === 'open' && openGigs.length > 0) ||
    (statusFilter === 'expired' && expiredGigs.length > 0) ||
    (statusFilter === 'completed' && completedGigs.length > 0)

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
      {!hasFilteredGigs && <StatusEmptyState />}
      {(statusFilter === 'all' || statusFilter === 'action') && actionGigs.length > 0 && (
        <GigCarousel
          title="Needs Action"
          count={actionGigs.length}
          color="var(--color-danger)"
        >
          {sectionHeader('🔴 Needs Action', 'var(--color-danger)')}
          {actionGigs.map(renderGig)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'inprogress') && inProgressGigs.length > 0 && (
        <GigCarousel
          title="In Progress"
          count={inProgressGigs.length}
          color="var(--color-warning)"
        >
          {sectionHeader('🟡 In Progress', 'var(--color-warning)')}
          {inProgressGigs.map(renderGig)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'open') && openGigs.length > 0 && (
        <GigCarousel title="Open" count={openGigs.length} color="var(--color-success)">
          {sectionHeader('🟢 Open', 'var(--color-success)')}
          {openGigs.map(renderGig)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'expired') && expiredGigs.length > 0 && (
        <GigCarousel
          title="Expired"
          count={expiredGigs.length}
          color="var(--color-text-subtle)"
        >
          {expiredGigs.map(renderGig)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'completed') && completedGigs.length > 0 && (
        <GigCarousel
          title="Completed"
          count={completedGigs.length}
          color="var(--color-text-muted)"
        >
          {sectionHeader('✅ Completed', 'var(--color-text-muted)')}
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
    open: { color: 'var(--color-success)', bg: 'var(--color-success-soft)', border: 'var(--color-success-border)', label: 'Open' },
    hasapplicants: { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', border: 'var(--color-danger-border)', label: `${pendingApps.length} Applicant${pendingApps.length > 1 ? 's' : ''}` },
    inprogress: { color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', border: 'var(--color-warning-border)', label: 'In Progress' },
    waiting: { color: 'var(--color-brand)', bg: 'var(--color-brand-soft)', border: 'var(--color-brand-border-strong)', label: 'Awaiting Confirmation' },
    expired: { color: 'var(--color-text-subtle)', bg: 'var(--color-page)', border: 'var(--color-border)', label: 'Expired' },
    completed: { color: 'var(--color-text-muted)', bg: 'var(--color-page)', border: 'var(--color-border)', label: 'Completed' },
  }

  const sc = statusConfig[status] || statusConfig.open

  return (
    <div className="my-gig-card" style={{
      background: 'var(--color-surface)', border: `1.5px solid ${sc.border}`,
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
              fontSize: '12px', fontWeight: '800',
              color: sc.color, marginBottom: '6px',
              letterSpacing: '0.5px'
            }}>
              {sc.label.toUpperCase()}
            </div>
            <div style={{
              fontSize: '17px', fontWeight: '900', color: 'var(--color-text)',
              lineHeight: 1.25
            }}>{gig.title}</div>
            <div style={{
              fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px',
              fontWeight: '700', lineHeight: 1.35
            }}>
              {currency.symbol}{gig.pay_min}–{currency.symbol}{gig.pay_max} ·{' '}
              {gig.location || 'Remote'} · {timeAgo(gig.created_at)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
              <ExpiryBadge expiresAt={gig.expires_at} />
              {!gig.expires_at && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>No expiry</span>
              )}
            </div>
          </div>
          <span style={{
            fontSize: '14px', color: 'var(--color-text-subtle)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s'
          }}>▼</span>
        </div>

        {/* Worker info if in progress */}
        {(status === 'inprogress' || status === 'waiting') && acceptedWorker && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center',
            background: 'var(--color-page)', borderRadius: '10px',
            padding: '8px 10px', marginTop: '6px'
          }}>
            <div
              onClick={(e) => {
                e.stopPropagation()
                onViewProfile(acceptedWorkerId)
              }}
              style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'var(--color-brand-soft)', overflow: 'hidden',
                flexShrink: 0, cursor: 'pointer',
                border: '1.5px solid var(--color-brand-border-strong)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '13px',
                fontWeight: '800', color: 'var(--color-brand)'
              }}>
              {acceptedWorker?.avatar_url ? (
                <img src={acceptedWorker.avatar_url} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : acceptedWorker?.full_name?.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '12px', fontWeight: '600', color: 'var(--color-text)'
              }}>{acceptedWorker?.full_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
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
                background: 'var(--color-brand-soft)', overflow: 'hidden',
                border: '1.5px solid var(--color-brand-border-strong)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '13px',
                fontWeight: '800', color: 'var(--color-brand)'
              }}>
                {app.users?.avatar_url ? (
                  <img src={app.users.avatar_url} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : app.users?.full_name?.charAt(0) || '?'}
              </div>
            ))}
            {pendingApps.length > 3 && (
              <div style={{
                fontSize: '13px', color: 'var(--color-brand)',
                fontWeight: '700', marginLeft: '4px'
              }}>+{pendingApps.length - 3} more</div>
            )}
          </div>
        )}
      </div>

      {/* Action Area */}
      <div style={{
        borderTop: '1px solid var(--color-page)',
        padding: '12px 16px', background: 'var(--color-surface-neutral)'
      }}>

        {/* HAS APPLICANTS */}
        {status === 'hasapplicants' && (
          <button
            onClick={() => onViewApplicants(gig)}
            style={{
              width: '100%',
              background: 'var(--color-brand-gradient)',
              border: 'none', borderRadius: '12px', padding: '13px',
              fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
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
        background: 'var(--color-warning-soft)', border: '1px solid var(--color-warning-border)',
        borderRadius: '8px', padding: '8px 12px',
        fontSize: '13px', color: 'var(--color-warning)',
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
        background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
        borderRadius: '12px', padding: '12px', marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: 'var(--color-brand)', marginBottom: '3px'
        }}>💰 Funds in Escrow</div>
        <div style={{
          fontSize: '13px', color: 'var(--color-brand)',
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
    background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
    border: 'none', borderRadius: '10px', padding: '11px',
    fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 3px 12px rgba(0,196,140,0.35)'
  }}>
  ✓ Mark Done →
</button>
      </div>
    ) : (
      // MANUAL GIG — existing receipt upload flow
      <div style={{
        background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
        borderRadius: '12px', padding: '12px', marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: 'var(--color-brand)', marginBottom: '3px'
        }}>📎 Ready to upload receipt?</div>
        <div style={{
          fontSize: '13px', color: 'var(--color-brand)',
          opacity: 0.8, marginBottom: '8px'
        }}>
          When you've paid {gig.worker?.full_name?.split(' ')[0]},
          confirm the payment here.
        </div>
        <button
          onClick={() => onReceipt(gig)}
          style={{
            width: '100%',
            background: 'var(--color-brand-gradient)',
            border: 'none', borderRadius: '10px', padding: '11px',
            fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
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
          { detail: { userId: gig.worker_id } }
        ))}
        style={{
          flex: 1, background: 'var(--color-page)',
          border: '1.5px solid var(--color-border)',
          borderRadius: '10px', padding: '10px',
          fontSize: '12px', fontWeight: '700',
          color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '5px'
        }}>
        <BrandIcon name="chat" size={18} active /> Message
      </button>
      {gig.type === 'physical' && (
        <button
          onClick={() => onTrack(gig)}
          style={{
            flex: 1, background: 'var(--color-warning-soft)',
            border: '1.5px solid var(--color-warning-border)',
            borderRadius: '10px', padding: '10px',
            fontSize: '12px', fontWeight: '700',
            color: 'var(--color-warning)', cursor: 'pointer', fontFamily: 'inherit',
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
              background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
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
                    fontSize: '12px', fontWeight: '700', color: 'var(--color-brand)'
                  }}>
                    Waiting for {acceptedWorker?.full_name?.split(' ')[0]} to confirm
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-brand)', opacity: 0.8 }}>
                    You confirmed {getCurrency(receipt?.currency || 'USD').symbol}
                    {receipt?.amount?.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(
                'openChatWithUser',
                { detail: { userId: acceptedWorkerId } }
              ))}
              style={{
                width: '100%', background: 'var(--color-page)',
                border: '1.5px solid var(--color-border)',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit',
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
                flex: 1, background: 'var(--color-page)',
                border: '1.5px solid var(--color-border)',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '5px'
              }}>
              <BrandIcon name="edit" size={18} active={false} /> Edit
            </button>
            {['open', 'hasapplicants'].includes(status) && (
              <button
                onClick={() => onDelete(gig.id)}
                style={{
                  background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '5px'
                }}>
                🗑️
              </button>
            )}
          </div>
        )}
        {status === 'expired' && (
          <div style={{ marginTop: '10px' }}>
            <button
              onClick={() => onDelete(gig.id)}
              style={{
                width: '100%', background: 'var(--color-page)',
                border: '1.5px solid var(--color-border)',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '5px'
              }}>
              🗑️ Delete Gig
            </button>
          </div>
        )}

        {/* COMPLETED */}
        {status === 'completed' && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', color: 'var(--color-success)', fontWeight: '600',
              marginBottom: '10px'
            }}>
              <BrandIcon name="completed" size={20} active />
              {getCurrency(receipt?.currency || 'USD').symbol}
              {receipt?.amount?.toLocaleString()} · Completed
            </div>
          </div>
        )}
      </div>

      <style>{`
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════
// WORKING TAB
// ══════════════════════════════════════════
function WorkingTab({
  statusFilter, applications, getStatus, pendingCommissions, totalOwed,
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

  const hasFilteredApps = statusFilter === 'all' ||
    (statusFilter === 'action' && (actionApps.length > 0 || pendingCommissions.length > 0)) ||
    (statusFilter === 'inprogress' && inProgressApps.length > 0) ||
    (statusFilter === 'pending' && pendingApps.length > 0) ||
    (statusFilter === 'completed' && completedApps.length > 0)

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
      {(statusFilter === 'all' || statusFilter === 'action') && pendingCommissions.length > 0 && (
        <div
          onClick={() => window.dispatchEvent(
            new CustomEvent('navigateTo', { detail: 'commission' })
          )}
          style={{
            background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
            borderRadius: '14px', padding: '12px 16px',
            marginTop: '12px', marginBottom: '4px',
            cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center'
          }}>
          <div>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: 'var(--color-danger)'
            }}>💰 Commission due</div>
            <div style={{
              fontSize: '13px', color: 'var(--color-danger)', opacity: 0.8
            }}>
              {pendingCommissions.length} pending · Pay to maintain account
            </div>
          </div>
          <div style={{
            background: 'var(--color-danger)', color: 'var(--color-surface)',
            borderRadius: '8px', padding: '6px 12px',
            fontSize: '12px', fontWeight: '700'
          }}>Pay Now →</div>
        </div>
      )}

      {!hasFilteredApps && <StatusEmptyState />}
      {(statusFilter === 'all' || statusFilter === 'action') && actionApps.length > 0 && (
        <GigCarousel
          title="Action Required"
          count={actionApps.length}
          color="var(--color-danger)"
        >
          {sectionHeader('🔴 Action Required', 'var(--color-danger)')}
          {actionApps.map(renderApp)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'inprogress') && inProgressApps.length > 0 && (
        <GigCarousel
          title="In Progress"
          count={inProgressApps.length}
          color="var(--color-warning)"
        >
          {sectionHeader('🟡 In Progress', 'var(--color-warning)')}
          {inProgressApps.map(renderApp)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'pending') && pendingApps.length > 0 && (
        <GigCarousel title="Pending" count={pendingApps.length} color="var(--color-brand)">
          {sectionHeader('🔵 Pending', 'var(--color-brand)')}
          {pendingApps.map(renderApp)}
        </GigCarousel>
      )}
      {(statusFilter === 'all' || statusFilter === 'completed') && completedApps.length > 0 && (
        <GigCarousel
          title="Completed"
          count={completedApps.length}
          color="var(--color-text-muted)"
        >
          {sectionHeader('✅ Completed', 'var(--color-text-muted)')}
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
    pending: { color: 'var(--color-brand)', bg: 'var(--color-brand-soft)', border: 'var(--color-brand-border-strong)', label: 'Applied' },
    inprogress: { color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', border: 'var(--color-warning-border)', label: '🎉 You Got This Job!' },
    confirmreceipt: { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', border: 'var(--color-danger-border)', label: '⚡ Action Required' },
    completed: { color: 'var(--color-success)', bg: 'var(--color-success-soft)', border: 'var(--color-success-border)', label: '✅ Completed' },
    declined: { color: 'var(--color-text-muted)', bg: 'var(--color-page)', border: 'var(--color-border)', label: 'Not Selected' },
  }

  const sc = statusConfig[status] || statusConfig.pending

  return (
    <div style={{
      background: 'var(--color-surface)', border: `1.5px solid ${sc.border}`,
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
          fontSize: '12px', fontWeight: '800',
          color: sc.color, marginBottom: '8px',
          letterSpacing: '0.5px'
        }}>
          {sc.label.toUpperCase()}
        </div>

        <div style={{
          fontSize: '17px', fontWeight: '900',
          color: 'var(--color-text)', marginBottom: '8px',
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
              background: 'var(--color-brand-soft)', overflow: 'hidden',
              flexShrink: 0, cursor: 'pointer',
              border: '1px solid var(--color-brand-border-strong)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '12px',
              fontWeight: '800', color: 'var(--color-brand)'
            }}>
            {poster?.avatar_url ? (
              <img src={poster.avatar_url} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : poster?.full_name?.charAt(0) || '?'}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {poster?.full_name || 'Poster'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>·</span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {gig?.location || 'Remote'}
          </span>
        </div>

        <div style={{
          fontSize: '15px', color: 'var(--color-success)',
          fontWeight: '900', marginTop: '8px'
        }}>
          {getCurrency(gig?.currency || 'USD').symbol}
          {gig?.pay_min}–{getCurrency(gig?.currency || 'USD').symbol}
          {gig?.pay_max}
        </div>
      </div>

      {/* Action Area */}
      <div style={{
        borderTop: '1px solid var(--color-page)',
        padding: '12px 16px', background: 'var(--color-surface-neutral)'
      }}>

        {/* PENDING */}
        {status === 'pending' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Waiting for a response · Applied {timeAgo(application.created_at)}
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(
                'openChatWithUser',
                { detail: { userId: gig?.poster_id } }
              ))}
              style={{
                background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                borderRadius: '8px', padding: '8px 12px',
                fontSize: '12px', fontWeight: '700',
                color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit',
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
              background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)',
              borderRadius: '10px', padding: '10px 12px',
              marginBottom: '10px', fontSize: '12px',
              color: 'var(--color-success)', fontWeight: '600'
            }}>
              You've been accepted! Do the work and wait for{' '}
              {poster?.full_name?.split(' ')[0] || 'the poster'} to confirm {isWalletGig ? 'completion' : 'payment'}.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent(
                  'openChatWithUser',
                  { detail: { userId: gig?.poster_id } }
                ))}
                style={{
                  flex: 1, background: 'var(--color-page)',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: '10px', padding: '10px',
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '5px'
                }}>
                <BrandIcon name="chat" size={18} active /> Message
              </button>
              {gig?.type === 'physical' && (
                <button
                  onClick={() => onTrack(gig)}
                  style={{
                    flex: 1, background: 'var(--color-warning-soft)',
                    border: '1.5px solid var(--color-warning-border)',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: 'var(--color-warning)', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '5px'
                  }}>
                  <BrandIcon name="location" size={18} active /> Track
                </button>
              )}
            </div>
          </div>
        )}

        {/* CONFIRM RECEIPT */}
        {status === 'confirmreceipt' && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, var(--color-warning-soft), var(--color-danger-soft))',
              border: '1.5px solid var(--color-danger-border)',
              borderRadius: '12px', padding: '14px',
              marginBottom: '10px'
            }}>
              <div style={{
                fontSize: '13px', fontWeight: '700', color: 'var(--color-warning)',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                marginBottom: '6px'
              }}>
                {poster?.full_name?.split(' ')[0] || 'Poster'} confirmed your payment
              </div>
              <div style={{
                fontSize: '28px', fontWeight: '800',
                color: 'var(--color-text)', lineHeight: 1, marginBottom: '2px'
              }}>
                {currency.symbol}{receipt?.amount?.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {receipt?.currency || 'USD'} · Is this what you received?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => onReceipt(gig)}
                style={{
                  flex: 1, background: 'var(--color-danger-soft)',
                  border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '10px', padding: '12px',
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit'
                }}>✗ Dispute</button>
              <button
                onClick={() => onReceipt(gig)}
                style={{
                  flex: 2,
                  background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                  border: 'none', borderRadius: '10px', padding: '12px',
                  fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
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
                fontSize: '13px', color: 'var(--color-success)', fontWeight: '700'
              }}>
                <BrandIcon name="completed" size={20} active />
                Earned {currency.symbol}{receipt?.amount?.toLocaleString() || gig?.pay_max}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>
                {timeAgo(application.accepted_at)}
              </div>
            </div>

            {/* Commission status */}
            {commission && (
              <div style={{
                background: 'linear-gradient(135deg, var(--color-danger-soft), var(--color-warning-soft))',
                border: '1.5px solid var(--color-danger-border)',
                borderRadius: '12px', padding: '12px 14px',
                marginTop: '10px'
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: '10px'
                }}>
                  <div>
                    <div style={{
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-warning)', textTransform: 'uppercase',
                      letterSpacing: '0.8px', marginBottom: '3px'
                    }}>Platform Commission Due</div>
                    <div style={{
                      fontSize: '22px', fontWeight: '800', color: 'var(--color-danger)'
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
                    background: 'linear-gradient(135deg, var(--color-danger), var(--color-warning))',
                    color: 'var(--color-surface)', border: 'none', borderRadius: '10px',
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
        background: 'var(--color-surface)', borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        maxHeight: '85vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: 'var(--color-border)', borderRadius: '2px',
          margin: '12px auto 0'
        }} />
        <div style={{ padding: '20px' }}>
          <div style={{
            fontSize: '18px', fontWeight: '800',
            color: 'var(--color-text)', marginBottom: '4px'
          }}>Applicants</div>
          <div style={{
            fontSize: '13px', color: 'var(--color-text-muted)',
            marginBottom: '20px'
          }}>
            {pendingApps.length} people applied for "{gig.title}"
          </div>

          {pendingApps.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px',
              color: 'var(--color-text-subtle)'
            }}>No pending applicants</div>
          ) : pendingApps.map((app, i) => (
            <div key={app.id} style={{
              background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
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
                    borderRadius: '12px', background: 'var(--color-brand-soft)',
                    overflow: 'hidden', flexShrink: 0,
                    cursor: 'pointer', border: '2px solid var(--color-brand-border-strong)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px',
                    fontWeight: '800', color: 'var(--color-brand)'
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
                      color: 'var(--color-brand)', cursor: 'pointer',
                      marginBottom: '2px'
                    }}>
                    {app.users?.full_name || 'Unknown'} →
                  </div>
                  <div style={{
                    fontSize: '13px', color: 'var(--color-text-muted)'
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
                    { detail: { userId: app.worker_id } }
                  ))}
                  style={{
                    flex: 1, background: 'var(--color-surface)',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: 'var(--color-brand)', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>💬 Chat</button>
                <button
                  onClick={() => onDecline(app)}
                  style={{
                    flex: 1, background: 'var(--color-danger-soft)',
                    border: '1.5px solid var(--color-danger-border)',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: 'var(--color-danger)', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>✗ Decline</button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onAccept(app)
                  }}
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                    border: 'none', borderRadius: '10px', padding: '10px',
                    fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
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
    <div className="my-gigs-stat" style={{
      background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
      borderRadius: '13px', padding: '7px 9px',
      boxShadow: '0 8px 18px rgba(20,18,58,0.05)'
    }}>
      <div style={{
        fontSize: '18px', fontWeight: '900',
        color, lineHeight: 1, marginBottom: '3px'
      }}>{value}</div>
      <div style={{
        fontSize: '12px', color: 'var(--color-text-muted)',
        fontWeight: '850', textTransform: 'uppercase',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>{label}</div>
    </div>
  )
}

function StatusEmptyState() {
  return (
    <div className="my-gig-status-empty">
      <div>No gigs in this status yet</div>
      <span>Choose another status to see more of your work.</span>
    </div>
  )
}

function GigCarousel({ title, count, color, children }) {
  const helper = title === 'Needs Action' || title === 'Action Required'
    ? 'Handle these first'
    : title === 'In Progress'
      ? 'Currently active'
      : title === 'Open'
        ? 'Visible to workers'
        : title === 'Pending'
          ? 'Waiting for response'
          : title === 'Expired'
            ? 'No longer active'
            : 'History'

  return (
    <section className="my-gig-carousel" style={{
      marginTop: '14px',
      background: 'var(--color-surface)',
      border: '1.5px solid var(--color-border)',
      borderRadius: '18px',
      padding: '12px 0 10px',
      boxShadow: '0 10px 26px rgba(20,18,58,0.055)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '12px',
        marginBottom: '10px',
        padding: '0 14px'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: '8px', minWidth: 0
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: '15px',
              fontWeight: '900', color: 'var(--color-text)',
              lineHeight: 1.15
            }}>{title}</h2>
            <div style={{
              fontSize: '13px',
              color: 'var(--color-text-muted)',
              fontWeight: '750',
              marginTop: '3px'
            }}>
              {helper}
            </div>
          </div>
        </div>
        <span style={{
          background: 'var(--color-surface)', border: `1.5px solid ${color}44`,
          color, borderRadius: '999px', padding: '5px 9px',
          fontSize: '13px', fontWeight: '900',
          flexShrink: 0
        }}>
          {count}
        </span>
      </div>
      <div className="my-gig-carousel-track" style={{
        display: 'flex', gap: '12px',
        overflowX: 'auto', overflowY: 'hidden',
        scrollSnapType: 'x proximity',
        WebkitOverflowScrolling: 'touch',
        padding: '2px 14px 8px'
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
      background: 'var(--color-surface)', borderRadius: '20px',
      border: '1.5px solid var(--color-border)', marginTop: '16px'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '14px' }}>{icon}</div>
      <div style={{
        fontSize: '16px', fontWeight: '700',
        color: 'var(--color-text)', marginBottom: '6px'
      }}>{title}</div>
      <div style={{
        fontSize: '13px', color: 'var(--color-text-subtle)',
        lineHeight: '1.6', marginBottom: action ? '20px' : '0'
      }}>{subtitle}</div>
      {action && onAction && (
        <button
          onClick={onAction}
          style={{
            background: 'var(--color-brand-gradient)',
            border: 'none', borderRadius: '12px',
            padding: '12px 24px', fontSize: '13px',
            fontWeight: '700', color: 'var(--color-surface)',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 16px rgba(108,71,255,0.35)'
          }}>{action}</button>
      )}
    </div>
  )
}
