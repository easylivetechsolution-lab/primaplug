import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAdmin } from '../hooks/useAdmin'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import VerificationBadge from '../components/VerificationBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { showToast } from '../utils/toast'

const TABS = [
  { key: 'overview', label: '📊 Overview', icon: '📊' },
  { key: 'users', label: '👥 Users', icon: '👥' },
  { key: 'gigs', label: '⚡ Gigs', icon: '⚡' },
  { key: 'services', label: '🛠 Services', icon: '🛠' },
  { key: 'disputes', label: '⚠️ Disputes', icon: '⚠️' },
  { key: 'receipts', label: '📎 Receipts', icon: '📎' },
  { key: 'withdrawals', label: '💸 Withdrawals', icon: '💸' },
  { key: 'reports', label: '🚨 Reports', icon: '🚨' },
  { key: 'emergency', label: '🆘 Emergency', icon: '🆘' },
]

export default function Admin() {
  const { user } = useAuth()
  const { isAdmin, loading } = useAdmin()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [gigs, setGigs] = useState([])
  const [services, setServices] = useState([])
  const [disputes, setDisputes] = useState([])
  const [receipts, setReceipts] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [reports, setReports] = useState([])
  const [emergencyReports, setEmergencyReports] = useState([])
  const [boosts, setBoosts] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [reportStatusFilter, setReportStatusFilter] = useState('pending')
  const [reportsError, setReportsError] = useState('')

  useEffect(() => {
    if (!loading && !isAdmin) navigate('/dashboard')
  }, [isAdmin, loading])

  useEffect(() => {
    if (isAdmin) {
      fetchOverview()
      fetchTabData(activeTab)
    }
  }, [isAdmin, activeTab])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'reports') return undefined
    const channel = supabase.channel(`admin-report-queue-${user?.id || 'admin'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => fetchTabData('reports'))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isAdmin, activeTab, user?.id])

  const fetchOverview = async () => {
    const [
      { count: totalUsers },
      { count: totalGigs },
      { count: totalServices },
      { count: totalReceipts },
      { count: openDisputes },
      { count: completedGigs },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('gigs').select('*', { count: 'exact', head: true }),
      supabase.from('services').select('*', { count: 'exact', head: true }),
      supabase.from('receipts').select('*', { count: 'exact', head: true }),
      supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('disputed', true),
      supabase.from('gigs').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    ])

    // Total platform value
    const { data: receiptData } = await supabase
      .from('receipts')
      .select('amount')
      .eq('completed', true)
    const totalValue = receiptData?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0

    // New users this week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { count: newUsersThisWeek } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('joined_at', weekAgo.toISOString())

    const { count: pendingWithdrawals } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    setStats({
      totalUsers, totalGigs, totalServices,
      totalReceipts, openDisputes, completedGigs,
      totalValue, newUsersThisWeek, pendingWithdrawals: pendingWithdrawals || 0
    })
  }

  const fetchTabData = async (tab) => {
    setLoadingData(true)
    switch (tab) {
      case 'users':
        const { data: usersData } = await supabase
          .from('users')
          .select('*')
          .order('joined_at', { ascending: false })
          .limit(100)
        setUsers(usersData || [])
        break
      case 'gigs':
        const { data: gigsData } = await supabase
          .from('gigs')
          .select('*, users(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(100)
        setGigs(gigsData || [])
        break
      case 'services':
        const { data: servicesData } = await supabase
          .from('services')
          .select('*, users(full_name, email, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(100)
        setServices(servicesData || [])
        const { data: boostsData } = await supabase
          .from('wallet_transactions')
          .select('*, users(full_name, email), services(title)')
          .eq('type', 'boost')
          .order('created_at', { ascending: false })
          .limit(50)
        setBoosts(boostsData || [])
        break
      case 'disputes':
        const { data: disputesData } = await supabase
          .from('receipts')
          .select(`
            *,
            gigs(id, title, payment_method, currency, escrow_amount, pay_min),
            poster:users!receipts_poster_id_fkey(full_name, email),
            worker:users!receipts_worker_id_fkey(full_name, email)
          `)
          .eq('disputed', true)
          .order('created_at', { ascending: false })
        setDisputes(disputesData || [])
        break
      case 'receipts':
        const { data: receiptsData } = await supabase
          .from('receipts')
          .select('*, gigs(title), poster:users!receipts_poster_id_fkey(full_name), worker:users!receipts_worker_id_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(100)
        setReceipts(receiptsData || [])
        break
      case 'withdrawals':
        const { data: withdrawalsData } = await supabase
          .from('withdrawals')
          .select('*, users(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(100)
        setWithdrawals(withdrawalsData || [])
        break
      case 'reports':
        const { data: reportsData, error: reportsFetchError } = await supabase
          .from('reports')
          .select(`
            *,
            reporter:users!reports_reporter_id_fkey(id, full_name, avatar_url, email, phone),
            reported:users!reports_reported_user_id_fkey(id, full_name, avatar_url, email, phone, location, selfie_url, trust_score, is_verified, is_banned)
          `)
          .order('created_at', { ascending: false })
        setReportsError(reportsFetchError?.message || '')
        setReports(reportsData || [])
        break
      case 'emergency':
        const { data: emergencyData } = await supabase
          .from('emergency_reports')
          .select(`
            *,
            reporter:users!emergency_reports_reporter_id_fkey(full_name, avatar_url, email, phone, location, selfie_url, trust_score),
            reported:users!emergency_reports_reported_user_id_fkey(full_name, avatar_url, email, phone, location, selfie_url)
          `)
          .order('created_at', { ascending: false })
        setEmergencyReports(emergencyData || [])
        break
    }
    setLoadingData(false)
  }

  const banUser = async (userId, confirmed = false) => {
    if (!confirmed) {
      setConfirmDialog({ title: 'Ban this user?', message: 'They will not be able to log in.', confirmLabel: 'Ban user', action: () => banUser(userId, true) })
      return
    }
    await supabase
      .from('users')
      .update({ is_banned: true })
      .eq('id', userId)
    fetchTabData('users')
  }

  const verifyUser = async (userId) => {
    await supabase
      .from('users')
      .update({ is_verified: true })
      .eq('id', userId)
    fetchTabData('users')
  }

  const deleteGig = async (gigId, confirmed = false) => {
    if (!confirmed) {
      setConfirmDialog({ title: 'Delete this gig?', message: 'This will permanently remove the gig from the platform.', confirmLabel: 'Delete gig', action: () => deleteGig(gigId, true) })
      return
    }
    await supabase.from('gigs').delete().eq('id', gigId)
    fetchTabData('gigs')
  }

  const performReportAction = async (report, action) => {
    let result
    let notice
    if (action === 'ban_user') {
      result = await supabase.from('users').update({ is_banned: true }).eq('id', report.reported_user_id)
      notice = 'Your Prima account has been suspended after a review. Contact support if you believe this is a mistake.'
    } else if (action === 'remove_gig') {
      result = await supabase.from('gigs').update({ deleted_at: new Date().toISOString() }).eq('id', report.reported_gig_id)
      notice = 'A gig you posted was removed after a review of a report.'
    } else if (action === 'deactivate_service') {
      result = await supabase.from('services').update({ is_active: false }).eq('id', report.reported_service_id)
      notice = 'A service you posted was deactivated after a review of a report.'
    } else if (action === 'require_reverification') {
      result = await supabase.from('users').update({ reverification_required: true }).eq('id', report.reported_user_id)
      notice = 'Your account requires re-verification. Please update your selfie to continue using Prima.'
    }
    if (result?.error) throw result.error

    const { error: statusError } = await supabase.from('reports').update({ status: 'actioned' }).eq('id', report.id)
    if (statusError) throw statusError

    if (report.reported_user_id && notice) {
      const { error } = await supabase.from('notifications').insert({
        user_id: report.reported_user_id, title: 'Prima account action', message: notice, type: 'general'
      })
      if (error) console.warn('Moderation action succeeded but notification failed:', error)
    }
    showToast('Moderation action completed and report marked actioned', 'success')
    await fetchTabData('reports')
    if (action === 'remove_gig') await fetchTabData('gigs')
    if (action === 'deactivate_service') await fetchTabData('services')
  }

  const requestReportAction = (report, action, title, message, confirmLabel) => {
    setConfirmDialog({
      title, message, confirmLabel,
      action: async () => {
        try { await performReportAction(report, action) }
        catch (error) { showToast('Could not complete moderation action: ' + error.message, 'error') }
      }
    })
  }

  const resolveDispute = async (receiptId, favor) => {
    const dispute = disputes.find(d => d.id === receiptId)
    if (!dispute) return

    const gig = dispute.gigs
    const isWalletGig = gig?.payment_method === 'wallet'

    if (favor === 'worker') {
      // Mark receipt fully completed
      await supabase.from('receipts').update({
        disputed: false,
        dispute_reason: `Resolved in favor of worker by admin`,
        worker_confirmed: true,
        worker_confirmed_at: new Date().toISOString(),
        completed: true,
        completed_at: new Date().toISOString(),
        status: 'completed'
      }).eq('id', receiptId)

      if (isWalletGig && gig?.id) {
        // Release escrow to worker
        await supabase.rpc('release_gig_escrow', {
          p_gig_id: gig.id,
          p_poster_id: dispute.poster_id,
          p_worker_id: dispute.worker_id,
          p_amount: Number(gig.escrow_amount || gig.pay_min || dispute.amount),
          p_currency: gig.currency || 'NGN'
        })
      } else if (gig?.id) {
        // Create commission debt for worker (manual payment gig)
        const commissionAmount = Math.round((dispute.amount || 0) * 0.1 * 100) / 100
        const { data: existing } = await supabase
          .from('commissions')
          .select('id, status')
          .eq('gig_id', gig.id)
          .eq('worker_id', dispute.worker_id)
          .maybeSingle()

        if (!existing) {
          await supabase.from('commissions').insert({
            gig_id: gig.id,
            worker_id: dispute.worker_id,
            gig_amount: dispute.amount,
            commission_amount: commissionAmount,
            currency: dispute.currency || 'NGN',
            status: 'pending',
            due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          })
        }
      }

      if (gig?.id) {
        await supabase.rpc('increment_gigs_completed', { worker_id: dispute.worker_id })
      }

      const paymentDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()

      if (!isWalletGig) {
        // Set a 5-day payment deadline — pg_cron will auto-ban if missed
        await supabase.from('receipts').update({
          payment_ordered: true,
          payment_deadline: paymentDeadline
        }).eq('id', receiptId)
      }

      // Notify winner (worker)
      await supabase.from('notifications').insert({
        user_id: dispute.worker_id,
        title: '✅ Dispute Resolved — In Your Favor',
        message: isWalletGig
          ? `Admin reviewed the dispute for "${gig?.title}" and ruled in your favor. Your payment has been released to your wallet.`
          : `Admin reviewed the dispute for "${gig?.title}" and ruled in your favor. The poster has been ordered to pay you within 5 days. Commission is due within 3 days of receipt.`,
        type: isWalletGig ? 'wallet' : 'general',
        gig_id: gig?.id || null
      })

      // Notify loser (poster) — stern legal warning for manual gigs
      await supabase.from('notifications').insert({
        user_id: dispute.poster_id,
        title: isWalletGig ? 'Dispute Outcome — Favor Worker' : '⚠️ Payment Order — Action Required',
        message: isWalletGig
          ? `Admin reviewed the payment dispute for "${gig?.title}" and ruled in the worker's favor. The gig is now marked complete.`
          : `Admin has reviewed the dispute for "${gig?.title}" and ruled in the worker's favor. You are required to release the agreed payment to the worker within 5 days (by ${new Date(paymentDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}). Failure to comply will result in an immediate account ban and referral for legal action.`,
        type: 'general',
        gig_id: gig?.id || null
      })

    } else {
      // Favor poster — reset receipt so parties can re-negotiate
      await supabase.from('receipts').update({
        disputed: false,
        dispute_reason: `Resolved in favor of poster by admin`,
        poster_confirmed: false,
        worker_confirmed: false,
        completed: false,
        status: 'pending'
      }).eq('id', receiptId)

      if (isWalletGig && gig?.id) {
        // Return locked escrow back to poster's wallet
        await supabase.rpc('unlock_gig_escrow', {
          p_gig_id: gig.id,
          p_poster_id: dispute.poster_id,
          p_amount: Number(gig.escrow_amount || gig.pay_min || dispute.amount),
          p_currency: gig.currency || 'NGN'
        })
      }

      // Notify winner (poster)
      await supabase.from('notifications').insert({
        user_id: dispute.poster_id,
        title: '✅ Dispute Resolved — In Your Favor',
        message: isWalletGig
          ? `Admin reviewed the dispute for "${gig?.title}" and ruled in your favor. Your escrowed funds have been returned to your wallet.`
          : `Admin reviewed the dispute for "${gig?.title}" and ruled in your favor. You may re-submit a corrected receipt.`,
        type: isWalletGig ? 'wallet' : 'general',
        gig_id: gig?.id || null
      })

      // Notify loser (worker)
      await supabase.from('notifications').insert({
        user_id: dispute.worker_id,
        title: 'Dispute Outcome — Favor Poster',
        message: `Admin reviewed your dispute for "${gig?.title}" and ruled in the poster's favor. Please contact the poster to resolve the payment directly.`,
        type: 'general',
        gig_id: gig?.id || null
      })
    }

    fetchTabData('disputes')
    fetchOverview()
  }

  const dismissDispute = async (receiptId) => {
    const dispute = disputes.find(d => d.id === receiptId)
    // Reset to worker_confirm step so worker sees the receipt again
    await supabase.from('receipts').update({
      disputed: false,
      dispute_reason: null,
      status: 'pending'
    }).eq('id', receiptId)

    const gig = dispute?.gigs

    await supabase.from('notifications').insert([
      {
        user_id: dispute.worker_id,
        title: 'Dispute Dismissed — Please Confirm',
        message: `Admin reviewed the dispute for "${gig?.title}" and dismissed it. Please review the receipt and confirm or re-raise your concern.`,
        type: 'receipt',
        gig_id: gig?.id || null
      },
      {
        user_id: dispute.poster_id,
        title: 'Dispute Dismissed',
        message: `The dispute raised on "${gig?.title}" was dismissed. The worker has been asked to review the receipt again.`,
        type: 'general',
        gig_id: gig?.id || null
      }
    ])

    fetchTabData('disputes')
    fetchOverview()
  }

  const timeAgo = (date) => {
    if (!date) return '—'
    const s = Math.floor((new Date() - new Date(date)) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      color: 'var(--color-brand)', fontSize: '16px'
    }}>Loading...</div>
  )

  if (!isAdmin) return null

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredGigs = gigs.filter(g =>
    g.title?.toLowerCase().includes(search.toLowerCase()) ||
    g.users?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const visibleReports = reportStatusFilter === 'all'
    ? reports
    : reports.filter(report => report.status === reportStatusFilter)

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-surface-tint)',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Top Bar */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-text), var(--color-brand-deep))',
        padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', position: 'sticky',
        top: 0, zIndex: 100,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'var(--color-brand-gradient)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px'
          }}>⚡</div>
          <div>
            <div style={{
              fontSize: '16px', fontWeight: '800', color: 'var(--color-surface)'
            }}>PrimaPlug Admin</div>
            <div style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', letterSpacing: '1px'
            }}>Control Room</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.6)'
          }}>
            👋 {user?.email}
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '7px 14px',
              fontSize: '12px', fontWeight: '600',
              color: 'var(--color-surface)', cursor: 'pointer',
              fontFamily: 'inherit'
            }}>← Back to App</button>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 69px)' }}>
        {/* Sidebar */}
        <div style={{
          width: '200px', background: 'var(--color-surface)',
          borderRight: '1.5px solid var(--color-border)',
          padding: '20px 12px', flexShrink: 0
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                setSearch('')
              }}
              style={{
                width: '100%', background: activeTab === tab.key
                  ? 'var(--color-brand-soft)' : 'transparent',
                border: `1.5px solid ${activeTab === tab.key ? 'var(--color-brand-border-strong)' : 'transparent'}`,
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '13px', fontWeight: activeTab === tab.key ? '700' : '500',
                color: activeTab === tab.key ? 'var(--color-brand)' : 'var(--color-text-muted)',
                cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', marginBottom: '4px',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.15s'
              }}>
              <span>{tab.icon}</span>
              <span>{tab.label.split(' ')[1]}</span>
              {tab.key === 'withdrawals' && stats?.pendingWithdrawals > 0 && (
                <span style={{
                  background: 'var(--color-warning-gold)', color: 'var(--color-surface)',
                  borderRadius: '10px', padding: '1px 6px',
                  fontSize: '12px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: '800', marginLeft: 'auto'
                }}>{stats.pendingWithdrawals}</span>
              )}
              {tab.key === 'disputes' && stats?.openDisputes > 0 && (
                <span style={{
                  background: 'var(--color-danger)', color: 'var(--color-surface)',
                  borderRadius: '50%', width: '18px', height: '18px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '12px',
                  fontWeight: '800', marginLeft: 'auto'
                }}>{stats.openDisputes}</span>
              )}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && stats && (
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '20px'
              }}>Platform Overview</div>

              {/* Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '14px', marginBottom: '24px'
              }}>
                {[
                  { label: 'Total Users', value: stats.totalUsers, icon: '👥', color: 'var(--color-brand)', sub: `+${stats.newUsersThisWeek} this week` },
                  { label: 'Total Gigs', value: stats.totalGigs, icon: '⚡', color: 'var(--color-warning)', sub: `${stats.completedGigs} completed` },
                  { label: 'Services', value: stats.totalServices, icon: '🛠', color: 'var(--color-info)', sub: 'Active listings' },
                  { label: 'Transactions', value: stats.totalReceipts, icon: '📎', color: 'var(--color-success)', sub: `$${stats.totalValue?.toFixed(0)} total value` },
                  { label: 'Open Disputes', value: stats.openDisputes, icon: '⚠️', color: 'var(--color-danger)', sub: 'Needs review' },
                  { label: 'Completed Gigs', value: stats.completedGigs, icon: '✅', color: 'var(--color-success)', sub: 'All time' },
                  { label: 'Pending Payouts', value: stats.pendingWithdrawals, icon: '💸', color: 'var(--color-warning-gold)', sub: 'Withdrawal requests' },
                ].map(({ label, value, icon, color, sub }) => (
                  <div key={label} style={{
                    background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                    borderRadius: '16px', padding: '18px'
                  }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
                    <div style={{
                      fontSize: '28px', fontWeight: '800',
                      color, marginBottom: '3px'
                    }}>{value?.toLocaleString() || 0}</div>
                    <div style={{
                      fontSize: '12px', fontWeight: '600',
                      color: 'var(--color-text)', marginBottom: '2px'
                    }}>{label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Platform Value */}
              <div style={{
                background: 'var(--color-brand-gradient)',
                borderRadius: '20px', padding: '24px',
                color: 'var(--color-surface)', textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '12px', opacity: 0.8,
                  textTransform: 'uppercase', letterSpacing: '1.5px',
                  marginBottom: '8px'
                }}>Total Platform Transaction Value</div>
                <div style={{
                  fontSize: '48px', fontWeight: '800',
                  letterSpacing: '-2px', marginBottom: '4px'
                }}>
                  ${stats.totalValue?.toLocaleString('en-US', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2
                  })}
                </div>
                <div style={{ fontSize: '13px', opacity: 0.7 }}>
                  Across all completed transactions
                </div>
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '16px'
              }}>
                <div style={{
                  fontSize: '20px', fontWeight: '800', color: 'var(--color-text)'
                }}>Users ({users.length})</div>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search users..."
                  style={{
                    background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                    borderRadius: '10px', padding: '8px 14px',
                    fontSize: '13px', color: 'var(--color-text)',
                    fontFamily: 'inherit', outline: 'none', width: '220px'
                  }}
                />
              </div>

              <div style={{
                background: 'var(--color-surface)', borderRadius: '16px',
                border: '1.5px solid var(--color-border)', overflow: 'hidden'
              }}>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr 1fr',
                  padding: '12px 16px',
                  background: 'var(--color-surface-tint)',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-text-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.8px', gap: '8px'
                }}>
                  <span>Name</span>
                  <span>Email</span>
                  <span>Trust</span>
                  <span>Gigs</span>
                  <span>Level</span>
                  <span>Joined</span>
                  <span>Actions</span>
                </div>

                {loadingData ? (
                  <div style={{
                    padding: '32px', textAlign: 'center',
                    color: 'var(--color-text-subtle)'
                  }}>Loading...</div>
                ) : filteredUsers.map((u, i) => (
                  <div key={u.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr 1fr',
                    padding: '12px 16px',
                    borderBottom: i < filteredUsers.length - 1
                      ? '1px solid var(--color-page)' : 'none',
                    alignItems: 'center', gap: '8px',
                    background: u.is_banned ? 'var(--color-surface-danger)' : 'var(--color-surface)'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '8px',
                        background: 'var(--color-brand-soft)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '800',
                        color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0
                      }}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : u.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div style={{
                          fontSize: '12px', fontWeight: '600',
                          color: 'var(--color-text)'
                        }}>{u.full_name || '—'}</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {u.is_verified && (
                            <VerificationBadge compact />
                          )}
                          {u.is_admin && (
                            <span style={{
                              fontSize: '12px', background: 'var(--color-danger-soft)',
                              color: 'var(--color-danger)', borderRadius: '3px',
                              padding: '1px 4px', fontWeight: '700'
                            }}>ADMIN</span>
                          )}
                          {u.is_banned && (
                            <span style={{
                              fontSize: '12px', background: 'var(--color-danger-soft)',
                              color: 'var(--color-danger)', borderRadius: '3px',
                              padding: '1px 4px', fontWeight: '700'
                            }}>BANNED</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>{u.email || '—'}</div>
                    <div style={{
                      fontSize: '12px', fontWeight: '700',
                      color: u.trust_score >= 80 ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>{u.trust_score || 100}%</div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text)', fontWeight: '600'
                    }}>{u.gigs_completed || 0}</div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-muted)',
                      textTransform: 'capitalize'
                    }}>{u.level || 'new'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                      {timeAgo(u.joined_at)}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {!u.is_verified && !u.is_admin && (
                        <button
                          onClick={() => verifyUser(u.id)}
                          title="Verify User"
                          style={{
                            background: 'var(--color-success-soft)',
                            border: '1px solid var(--color-success-border)',
                            borderRadius: '6px', padding: '4px 7px',
                            fontSize: '12px', fontWeight: '700',
                            color: 'var(--color-success)', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>✓</button>
                      )}
                      {!u.is_admin && !u.is_banned && (
                        <button
                          onClick={() => banUser(u.id)}
                          title="Ban User"
                          style={{
                            background: 'var(--color-danger-soft)',
                            border: '1px solid var(--color-danger-border)',
                            borderRadius: '6px', padding: '4px 7px',
                            fontSize: '12px', fontWeight: '700',
                            color: 'var(--color-danger)', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>🚫</button>
                      )}
                      {u.is_banned && (
                        <button
                          onClick={async () => {
                            await supabase
                              .from('users')
                              .update({ is_banned: false })
                              .eq('id', u.id)
                            fetchTabData('users')
                          }}
                          style={{
                            background: 'var(--color-brand-soft)',
                            border: '1px solid var(--color-brand-border-strong)',
                            borderRadius: '6px', padding: '4px 7px',
                            fontSize: '12px', fontWeight: '700',
                            color: 'var(--color-brand)', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>Unban</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GIGS TAB */}
          {activeTab === 'gigs' && (
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '16px'
              }}>
                <div style={{
                  fontSize: '20px', fontWeight: '800', color: 'var(--color-text)'
                }}>Gigs ({gigs.length})</div>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search gigs..."
                  style={{
                    background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                    borderRadius: '10px', padding: '8px 14px',
                    fontSize: '13px', color: 'var(--color-text)',
                    fontFamily: 'inherit', outline: 'none', width: '220px'
                  }}
                />
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                {filteredGigs.map(gig => (
                  <div key={gig.id} style={{
                    background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                    borderRadius: '14px', padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: '12px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px', fontWeight: '700',
                        color: 'var(--color-text)', marginBottom: '3px'
                      }}>{gig.title}</div>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-text-muted)'
                      }}>
                        By {gig.users?.full_name || '—'} ·{' '}
                        ${gig.pay_min}–${gig.pay_max} ·{' '}
                        {gig.type} · {gig.field || '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        background: gig.status === 'open' ? 'var(--color-success-soft)'
                          : gig.status === 'completed' ? 'var(--color-brand-soft)'
                            : 'var(--color-warning-soft)',
                        border: `1px solid ${gig.status === 'open' ? 'var(--color-success-border)'
                          : gig.status === 'completed' ? 'var(--color-brand-border-strong)'
                            : 'var(--color-warning-border)'}`,
                        borderRadius: '6px', padding: '3px 9px',
                        fontSize: '12px', fontWeight: '700',
                        color: gig.status === 'open' ? 'var(--color-success)'
                          : gig.status === 'completed' ? 'var(--color-brand)'
                            : 'var(--color-warning)',
                        textTransform: 'capitalize'
                      }}>{gig.status}</span>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-text-subtle)'
                      }}>{timeAgo(gig.created_at)}</div>
                      <button
                        onClick={() => deleteGig(gig.id)}
                        style={{
                          background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)',
                          borderRadius: '7px', padding: '5px 9px',
                          fontSize: '12px', fontWeight: '700',
                          color: 'var(--color-danger)', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>🗑 Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SERVICES TAB */}
          {activeTab === 'services' && (
            <div>
              {/* ── Active Boosts panel ── */}
              {boosts.length > 0 && (
                <div style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-warning-gold)', marginBottom: '12px' }}>
                    ⚡ Boost Transactions ({boosts.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {boosts.map(b => {
                      const isActive = b.services && services.find(s => s.id === b.service_id)?.is_featured
                      const until = services.find(s => s.id === b.service_id)?.featured_until
                      const daysLeft = until ? Math.ceil((new Date(until) - Date.now()) / 86400000) : 0
                      return (
                        <div key={b.id} style={{
                          background: 'var(--color-surface)', border: `1.5px solid ${b.status === 'completed' ? 'var(--color-warning-gold-border)' : 'var(--color-border)'}`,
                          borderRadius: '12px', padding: '12px 14px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)' }}>
                              {b.services?.title || 'Unknown service'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                              By {b.users?.full_name || '—'} · {b.currency} {Number(b.amount).toLocaleString()} · {b.description}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{
                              background: b.status === 'completed' ? 'var(--color-warning-gold-soft)' : 'var(--color-page)',
                              border: `1px solid ${b.status === 'completed' ? 'var(--color-warning-gold-border)' : 'var(--color-border)'}`,
                              borderRadius: '6px', padding: '3px 9px',
                              fontSize: '12px', fontWeight: '700',
                              color: b.status === 'completed' ? 'var(--color-warning-gold)' : 'var(--color-text-muted)',
                            }}>{b.status}</span>
                            {daysLeft > 0 && (
                              <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: '700' }}>{daysLeft}d left</span>
                            )}
                            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{timeAgo(b.created_at)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Services list ── */}
              <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '12px' }}>
                All Services ({services.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {services.map(service => {
                  const isFeatured = service.is_featured && service.featured_until && new Date(service.featured_until) > new Date()
                  const daysLeft   = service.featured_until
                    ? Math.ceil((new Date(service.featured_until) - Date.now()) / 86400000)
                    : 0
                  const isPermanent = service.is_featured && !service.featured_until

                  return (
                    <div key={service.id} style={{
                      background: 'var(--color-surface)',
                      border: `1.5px solid ${isFeatured || isPermanent ? 'var(--color-warning-gold-border)' : 'var(--color-border)'}`,
                      borderRadius: '14px', padding: '14px 16px',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: '12px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text)' }}>{service.title}</div>
                          {(isFeatured || isPermanent) && (
                            <span style={{
                              background: 'linear-gradient(135deg, var(--color-warning-gold), var(--color-warning))',
                              borderRadius: '5px', padding: '2px 7px',
                              fontSize: '12px', fontWeight: '800', color: 'var(--color-surface)',
                            }}>⚡ {isPermanent ? 'Pinned' : `${daysLeft}d left`}</span>
                          )}
                          {service.avg_rating > 0 && (
                            <span style={{ fontSize: '12px', color: 'var(--color-warning-gold)' }}>⭐ {Number(service.avg_rating).toFixed(1)} ({service.review_count})</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          By {service.users?.full_name || '—'} · From {service.basic_price} · {service.field || '—'} · {service.type}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{
                          background: service.is_active ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                          border: `1px solid ${service.is_active ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                          borderRadius: '6px', padding: '3px 9px',
                          fontSize: '12px', fontWeight: '700',
                          color: service.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>{service.is_active ? 'Active' : 'Inactive'}</span>

                        {/* Feature / Unfeature toggle */}
                        <button
                          onClick={async () => {
                            if (service.is_featured) {
                              await supabase.from('services')
                                .update({ is_featured: false, featured_until: null })
                                .eq('id', service.id)
                            } else {
                              await supabase.from('services')
                                .update({ is_featured: true, featured_until: null })
                                .eq('id', service.id)
                            }
                            fetchTabData('services')
                          }}
                          style={{
                            background: service.is_featured ? 'var(--color-warning-gold-soft)' : 'var(--color-page)',
                            border: `1px solid ${service.is_featured ? 'var(--color-warning-gold-border)' : 'var(--color-border)'}`,
                            borderRadius: '7px', padding: '5px 9px',
                            fontSize: '12px', fontWeight: '700',
                            color: service.is_featured ? 'var(--color-warning-gold)' : 'var(--color-text-muted)',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {service.is_featured ? '⚡ Unpin' : '⚡ Pin'}
                        </button>

                        <button
                          onClick={async () => {
                            await supabase.from('services')
                              .update({ is_active: !service.is_active })
                              .eq('id', service.id)
                            fetchTabData('services')
                          }}
                          style={{
                            background: 'var(--color-brand-soft)', border: '1px solid var(--color-brand-border-strong)',
                            borderRadius: '7px', padding: '5px 9px',
                            fontSize: '12px', fontWeight: '700',
                            color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {service.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          onClick={() => setConfirmDialog({
                            title: 'Delete this service?', message: 'This service will be permanently removed.', confirmLabel: 'Delete service',
                            action: async () => { await supabase.from('services').delete().eq('id', service.id); fetchTabData('services') }
                          })}
                          style={{
                            background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)',
                            borderRadius: '7px', padding: '5px 9px',
                            fontSize: '12px', fontWeight: '700',
                            color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit',
                          }}>🗑</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* DISPUTES TAB */}
          {activeTab === 'disputes' && (
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '16px'
              }}>
                Open Disputes ({disputes.length})
              </div>

              {disputes.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px',
                  background: 'var(--color-surface)', borderRadius: '16px',
                  border: '1.5px solid var(--color-border)'
                }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                  <div style={{
                    fontSize: '16px', fontWeight: '700', color: 'var(--color-text)'
                  }}>No open disputes</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)', marginTop: '6px' }}>
                    All transactions are clean
                  </div>
                </div>
              ) : disputes.map(dispute => (
                <div key={dispute.id} style={{
                  background: 'var(--color-surface)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '16px', padding: '18px',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '14px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '15px', fontWeight: '700',
                        color: 'var(--color-text)', marginBottom: '4px'
                      }}>{dispute.gigs?.title || 'Deleted Gig'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Amount: ${dispute.amount || '?'} ·{' '}
                        {timeAgo(dispute.created_at)}
                      </div>
                    </div>
                    <span style={{
                      background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)',
                      borderRadius: '7px', padding: '4px 10px',
                      fontSize: '12px', fontWeight: '800', color: 'var(--color-danger)'
                    }}>⚠️ DISPUTED</span>
                  </div>

                  <div style={{
                    background: 'var(--color-surface-danger)', borderRadius: '10px',
                    padding: '12px', marginBottom: '14px',
                    fontSize: '12px', color: 'var(--color-danger)', lineHeight: '1.5'
                  }}>
                    <strong>Dispute Reason:</strong>{' '}
                    {dispute.dispute_reason || 'No reason provided'}
                  </div>

                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '10px', marginBottom: '14px'
                  }}>
                    <div style={{
                      background: 'var(--color-page)', borderRadius: '10px', padding: '12px'
                    }}>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700',
                        textTransform: 'uppercase', marginBottom: '4px'
                      }}>Poster (Client)</div>
                      <div style={{
                        fontSize: '13px', fontWeight: '600', color: 'var(--color-text)'
                      }}>{dispute.poster?.full_name || '—'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {dispute.poster?.email}
                      </div>
                      {dispute.poster_receipt_url && (
                        <a href={dispute.poster_receipt_url}
                          target="_blank" rel="noreferrer"
                          style={{
                            display: 'inline-block', marginTop: '6px',
                            fontSize: '12px', color: 'var(--color-brand)',
                            fontWeight: '600'
                          }}>View Receipt →</a>
                      )}
                    </div>
                    <div style={{
                      background: 'var(--color-page)', borderRadius: '10px', padding: '12px'
                    }}>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700',
                        textTransform: 'uppercase', marginBottom: '4px'
                      }}>Worker</div>
                      <div style={{
                        fontSize: '13px', fontWeight: '600', color: 'var(--color-text)'
                      }}>{dispute.worker?.full_name || '—'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {dispute.worker?.email}
                      </div>
                      {dispute.worker_receipt_url && (
                        <a href={dispute.worker_receipt_url}
                          target="_blank" rel="noreferrer"
                          style={{
                            display: 'inline-block', marginTop: '6px',
                            fontSize: '12px', color: 'var(--color-brand)',
                            fontWeight: '600'
                          }}>View Receipt →</a>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => resolveDispute(dispute.id, 'poster')}
                      style={{
                        flex: 1, background: 'var(--color-brand-soft)',
                        border: '1.5px solid var(--color-brand-border-strong)',
                        borderRadius: '10px', padding: '11px',
                        fontSize: '12px', fontWeight: '700',
                        color: 'var(--color-brand)', cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}>✓ Favor Poster</button>
                    <button
                      onClick={() => resolveDispute(dispute.id, 'worker')}
                      style={{
                        flex: 1, background: 'var(--color-success-soft)',
                        border: '1.5px solid var(--color-success-border)',
                        borderRadius: '10px', padding: '11px',
                        fontSize: '12px', fontWeight: '700',
                        color: 'var(--color-success)', cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}>✓ Favor Worker</button>
                    <button
                      onClick={() => dismissDispute(dispute.id)}
                      style={{
                        background: 'var(--color-page)',
                        border: '1.5px solid var(--color-border)',
                        borderRadius: '10px', padding: '11px 14px',
                        fontSize: '12px', fontWeight: '700',
                        color: 'var(--color-text-muted)', cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* WITHDRAWALS TAB */}
          {activeTab === 'withdrawals' && (
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '16px'
              }}>Withdrawal Requests ({withdrawals.length})</div>
              {withdrawals.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px',
                  color: 'var(--color-text-subtle)', fontSize: '14px'
                }}>No withdrawal requests yet</div>
              ) : withdrawals.map(w => (
                <div key={w.id} style={{
                  background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '10px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '8px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '14px', fontWeight: '700', color: 'var(--color-text)'
                      }}>{w.users?.full_name || 'Unknown'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {w.users?.email}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '16px', fontWeight: '800', color: 'var(--color-success)'
                      }}>${w.dollar_amount?.toFixed(2)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                        {w.credits_amount} credits
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', gap: '8px', flexWrap: 'wrap',
                    marginBottom: '10px'
                  }}>
                    <span style={{
                      background: 'var(--color-brand-soft)', border: '1px solid var(--color-brand-border-strong)',
                      borderRadius: '6px', padding: '3px 8px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-brand)'
                    }}>{w.method?.toUpperCase()}</span>
                    <span style={{
                      background: w.status === 'pending' ? 'var(--color-warning-gold-soft)' : w.status === 'paid' ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                      border: `1px solid ${w.status === 'pending' ? 'var(--color-warning-gold-border)' : w.status === 'paid' ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                      borderRadius: '6px', padding: '3px 8px',
                      fontSize: '12px', fontWeight: '700',
                      color: w.status === 'pending' ? 'var(--color-warning-gold)' : w.status === 'paid' ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>{w.status?.toUpperCase()}</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                      {new Date(w.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{
                    background: 'var(--color-page)', borderRadius: '8px',
                    padding: '8px 12px', fontSize: '12px',
                    color: 'var(--color-text-muted)', marginBottom: '10px'
                  }}>
                    <strong>Account:</strong> {w.account_details}
                  </div>
                  {w.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setConfirmDialog({
                          title: `Confirm payment of $${w.dollar_amount?.toFixed(2)}?`,
                          message: `This marks the withdrawal to ${w.users?.full_name || 'this user'} as paid. Confirm only after you have sent the payment via Fincra or directly.`,
                          confirmLabel: 'Mark as paid',
                          action: async () => {

                          await supabase
                            .from('withdrawals')
                            .update({
                              status: 'paid',
                              paid_at: new Date().toISOString()
                            })
                            .eq('id', w.id)

                          await supabase.from('notifications').insert({
                            user_id: w.user_id,
                            title: '✅ Withdrawal Paid!',
                            message: `Your withdrawal of $${w.dollar_amount?.toFixed(2)} has been sent to your ${w.method === 'nigerian_bank' ? 'bank account' : w.method === 'mobile_money' ? 'mobile wallet' : 'account'}. Check within 24 hours.`,
                            type: 'general'
                          })

                          fetchTabData('withdrawals')
                          }
                        })}
                        style={{
                          flex: 2, background: 'var(--color-success-soft)',
                          border: '1.5px solid var(--color-success-border)',
                          borderRadius: '10px', padding: '10px',
                          fontSize: '13px', fontWeight: '700',
                          color: 'var(--color-success)', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>✓ Confirm Paid</button>
                      <button
                        onClick={async () => {
                          await supabase
                            .from('withdrawals')
                            .update({ status: 'rejected' })
                            .eq('id', w.id)
                          await supabase.rpc('add_credits', {
                            p_user_id: w.user_id,
                            p_amount: w.credits_amount,
                            p_type: 'withdrawal_refund',
                            p_description: 'Withdrawal rejected — credits refunded'
                          })
                          await supabase.from('notifications').insert({
                            user_id: w.user_id,
                            title: '❌ Withdrawal Rejected',
                            message: `Your withdrawal was rejected. ${w.credits_amount} credits have been refunded to your account.`,
                            type: 'general'
                          })
                          fetchTabData('withdrawals')
                        }}
                        style={{
                          flex: 1, background: 'var(--color-danger-soft)',
                          border: '1.5px solid var(--color-danger-border)',
                          borderRadius: '8px', padding: '8px',
                          fontSize: '12px', fontWeight: '700',
                          color: 'var(--color-danger)', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>✕ Reject & Refund</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* RECEIPTS TAB */}
          {activeTab === 'receipts' && (
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: 'var(--color-text)', marginBottom: '16px'
              }}>All Receipts ({receipts.length})</div>

              <div style={{
                background: 'var(--color-surface)', borderRadius: '16px',
                border: '1.5px solid var(--color-border)', overflow: 'hidden'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '12px 16px', background: 'var(--color-surface-tint)',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-text-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.8px', gap: '8px'
                }}>
                  <span>Gig</span>
                  <span>Poster</span>
                  <span>Worker</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>

                {receipts.map((receipt, i) => (
                  <div key={receipt.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    padding: '12px 16px',
                    borderBottom: i < receipts.length - 1
                      ? '1px solid var(--color-page)' : 'none',
                    alignItems: 'center', gap: '8px'
                  }}>
                    <div style={{
                      fontSize: '12px', fontWeight: '600',
                      color: 'var(--color-text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{receipt.gigs?.title || 'Deleted'}</div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-muted)'
                    }}>{receipt.poster?.full_name || '—'}</div>
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-muted)'
                    }}>{receipt.worker?.full_name || '—'}</div>
                    <div style={{
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-success)'
                    }}>${receipt.amount || '—'}</div>
                    <span style={{
                      background: receipt.completed ? 'var(--color-success-soft)'
                        : receipt.disputed ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)',
                      border: `1px solid ${receipt.completed ? 'var(--color-success-border)'
                        : receipt.disputed ? 'var(--color-danger-border)' : 'var(--color-warning-border)'}`,
                      borderRadius: '5px', padding: '2px 7px',
                      fontSize: '12px', fontWeight: '700',
                      color: receipt.completed ? 'var(--color-success)'
                        : receipt.disputed ? 'var(--color-danger)' : 'var(--color-warning)',
                      display: 'inline-block'
                    }}>
                      {receipt.completed ? 'Complete'
                        : receipt.disputed ? 'Disputed' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REPORTS TAB */}
          {activeTab === 'reports' && (
            <div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '16px' }}>
                Reports ({reports.length})
              </div>
              {reportsError && <div role="alert" style={{ background: 'var(--color-danger-soft)', borderRadius: '12px', padding: '12px 14px', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                Could not load reports: {reportsError} <button onClick={() => fetchTabData('reports')} style={{ marginLeft: '8px', color: 'inherit', border: 0, background: 'none', font: 'inherit', fontWeight: '800', textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
              </div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {['pending', 'reviewed', 'actioned', 'dismissed', 'all'].map(status => {
                  const count = status === 'all' ? reports.length : reports.filter(report => report.status === status).length
                  const selected = reportStatusFilter === status
                  return <button key={status} onClick={() => setReportStatusFilter(status)} style={{
                    border: selected ? '1px solid var(--color-brand-border-strong)' : '1px solid var(--color-border)',
                    borderRadius: '999px', padding: '8px 13px', cursor: 'pointer', font: 'inherit', fontSize: '13px', fontWeight: '700',
                    background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                    color: selected ? 'var(--color-brand)' : 'var(--color-text-muted)', textTransform: 'capitalize'
                  }}>{status} ({count})</button>
                })}
              </div>
              {visibleReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', background: 'var(--color-surface)', borderRadius: '16px', border: '1.5px solid var(--color-border)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text)' }}>No reports</div>
                </div>
              ) : visibleReports.map(report => (
                <div key={report.id} style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: '16px', padding: '18px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '3px' }}>
                        {report.reason.replace(/_/g, ' ').toUpperCase()}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {report.type} report · {timeAgo(report.created_at)}
                      </div>
                    </div>
                    <span style={{
                      background: report.status === 'pending' ? 'var(--color-warning-gold-soft)' : report.status === 'actioned' ? 'var(--color-success-soft)' : 'var(--color-page)',
                      border: `1px solid ${report.status === 'pending' ? 'var(--color-warning-gold-border)' : report.status === 'actioned' ? 'var(--color-success-border)' : 'var(--color-border)'}`,
                      borderRadius: '6px', padding: '3px 9px',
                      fontSize: '12px', fontWeight: '700',
                      color: report.status === 'pending' ? 'var(--color-warning-gold)' : report.status === 'actioned' ? 'var(--color-success)' : 'var(--color-text-muted)',
                      textTransform: 'capitalize'
                    }}>{report.status}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: 'var(--color-page)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Reporter · private to admins</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)' }}>{report.reporter?.full_name || 'Account unavailable'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{report.reporter?.email || report.reporter_id}</div>
                    </div>
                    <div style={{ background: 'var(--color-danger-soft)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Reported User</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)' }}>{report.reported?.full_name || '—'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{report.reported?.email || report.reported_user_id || 'Account unavailable'}</div>
                      {report.reported?.phone && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{report.reported.phone}</div>}
                      {report.reported?.location && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{report.reported.location}</div>}
                      {report.reported && <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)', marginTop: '4px' }}>Trust {report.reported.trust_score ?? '—'}% · {report.reported.is_verified ? 'Verified' : 'Not verified'} · {report.reported.is_banned ? 'Banned' : 'Active'}</div>}
                    </div>
                  </div>

                  {(report.reported_gig_id || report.reported_service_id) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      {report.reported_gig_id && <span style={{ background: 'var(--color-surface-tint)', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', color: 'var(--color-text-muted)' }}>Gig ID: {report.reported_gig_id}</span>}
                      {report.reported_service_id && <span style={{ background: 'var(--color-surface-tint)', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', color: 'var(--color-text-muted)' }}>Service ID: {report.reported_service_id}</span>}
                    </div>
                  )}

                  {report.details && (
                    <div style={{ background: 'var(--color-page)', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {report.details}
                    </div>
                  )}

                  {report.reported?.selfie_url && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>Reported User Selfie</div>
                      <img src={report.reported.selfie_url} alt="Reported user selfie"
                        style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', border: '2px solid var(--color-border)' }} />
                    </div>
                  )}

                  {!['actioned', 'dismissed'].includes(report.status) && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {report.status === 'pending' && <button onClick={async () => {
                        const { error } = await supabase.from('reports').update({ status: 'reviewed' }).eq('id', report.id)
                        if (error) { showToast('Could not update report: ' + error.message, 'error'); return }
                        showToast('Report marked as reviewed', 'success')
                        fetchTabData('reports')
                      }} style={{ flex: 1, background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--color-brand)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Mark Reviewed
                      </button>}
                      {report.reported_user_id && !report.reported?.is_banned && <button onClick={() => requestReportAction(report, 'require_reverification', 'Require re-verification?', 'The user will be asked to verify their identity again. This report will be marked actioned.', 'Require re-verification')} style={{ flex: 1, background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--color-warning)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Require Re-verify
                      </button>}
                      {report.reported_user_id && !report.reported?.is_banned && <button onClick={() => requestReportAction(report, 'ban_user', 'Suspend this account?', 'The user will lose access to Prima. This report will be marked actioned.', 'Suspend account')} style={{ flex: 1, background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit' }}>Suspend account</button>}
                      {report.reported_gig_id && <button onClick={() => requestReportAction(report, 'remove_gig', 'Remove this gig?', 'The gig will be hidden from the marketplace. This report will be marked actioned.', 'Remove gig')} style={{ flex: 1, background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit' }}>Remove gig</button>}
                      {report.reported_service_id && <button onClick={() => requestReportAction(report, 'deactivate_service', 'Deactivate this service?', 'The service will be hidden from the marketplace. This report will be marked actioned.', 'Deactivate service')} style={{ flex: 1, background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger-border)', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit' }}>Deactivate service</button>}
                      <button onClick={async () => {
                        const { error } = await supabase.from('reports').update({ status: 'dismissed' }).eq('id', report.id)
                        if (error) { showToast('Could not dismiss report: ' + error.message, 'error'); return }
                        showToast('Report dismissed', 'success')
                        fetchTabData('reports')
                      }} style={{ flex: 1, background: 'var(--color-page)', border: '1.5px solid var(--color-border)', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* EMERGENCY TAB */}
          {activeTab === 'emergency' && (
            <div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '16px' }}>
                Emergency Reports ({emergencyReports.length})
              </div>
              {emergencyReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', background: 'var(--color-surface)', borderRadius: '16px', border: '1.5px solid var(--color-border)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text)' }}>No emergency reports</div>
                </div>
              ) : emergencyReports.map(report => (
                <div key={report.id} style={{ background: 'var(--color-surface)', border: `1.5px solid ${report.status === 'pending' ? 'var(--color-danger-border)' : 'var(--color-border)'}`, borderRadius: '16px', padding: '18px', marginBottom: '12px' }}>
                  {report.status === 'pending' && (
                    <div style={{ background: 'var(--color-danger)', color: 'var(--color-surface)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: '700', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🆘 URGENT — Requires Immediate Attention
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: 'var(--color-page)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Filed by</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '3px' }}>{report.reporter?.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{report.reporter?.email}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{report.reporter?.phone}</div>
                    </div>
                    {report.reported && (
                      <div style={{ background: 'var(--color-danger-soft)', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Reported Person</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '3px' }}>{report.reported?.full_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{report.reported?.email}</div>
                      </div>
                    )}
                  </div>

                  {report.location_lat && (
                    <div style={{ background: 'var(--color-success-soft)', border: '1px solid var(--color-success-border)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: '600' }}>
                        📍 {report.location_lat.toFixed(6)}, {report.location_lng.toFixed(6)}
                      </span>
                      <a href={`https://maps.google.com/?q=${report.location_lat},${report.location_lng}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: '12px', color: 'var(--color-brand)', fontWeight: '700', textDecoration: 'none' }}>
                        Open in Maps →
                      </a>
                    </div>
                  )}

                  <div style={{ background: 'var(--color-surface-danger)', border: '1px solid var(--color-border-danger)', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '13px', color: 'var(--color-text)', lineHeight: '1.6' }}>
                    {report.description}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                    {report.reporter?.selfie_url && (
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Reporter Selfie</div>
                        <img src={report.reporter.selfie_url} alt="" style={{ width: '70px', height: '70px', borderRadius: '10px', objectFit: 'cover', border: '2px solid var(--color-border)' }} />
                      </div>
                    )}
                    {report.reported?.selfie_url && (
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Reported Selfie</div>
                        <img src={report.reported.selfie_url} alt="" style={{ width: '70px', height: '70px', borderRadius: '10px', objectFit: 'cover', border: '2px solid var(--color-danger-border)' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={async () => {
                      const reporterData = report.reporter
                      const reportedData = report.reported
                      const packageText = [
                        'PRIMA EMERGENCY REPORT — POLICE DATA PACKAGE',
                        `Generated: ${new Date().toLocaleString()}`,
                        `Report ID: ${report.id}`,
                        '',
                        '═══════════════════════════════════',
                        'INCIDENT DESCRIPTION',
                        '═══════════════════════════════════',
                        report.description,
                        '',
                        `Date Filed: ${new Date(report.created_at).toLocaleString()}`,
                        `Location: ${report.location_lat ? `${report.location_lat}, ${report.location_lng}` : 'Not available'}`,
                        `Google Maps: ${report.location_lat ? `https://maps.google.com/?q=${report.location_lat},${report.location_lng}` : 'N/A'}`,
                        '',
                        '═══════════════════════════════════',
                        'REPORTER DETAILS',
                        '═══════════════════════════════════',
                        `Full Name: ${reporterData?.full_name || 'N/A'}`,
                        `Email: ${reporterData?.email || 'N/A'}`,
                        `Phone: ${reporterData?.phone || 'N/A'}`,
                        `Location: ${reporterData?.location || 'N/A'}`,
                        `Trust Score: ${reporterData?.trust_score || 'N/A'}`,
                        `Selfie: ${reporterData?.selfie_url || 'N/A'}`,
                        '',
                        '═══════════════════════════════════',
                        'REPORTED PERSON DETAILS',
                        '═══════════════════════════════════',
                        `Full Name: ${reportedData?.full_name || 'N/A'}`,
                        `Email: ${reportedData?.email || 'N/A'}`,
                        `Phone: ${reportedData?.phone || 'N/A'}`,
                        `Location: ${reportedData?.location || 'N/A'}`,
                        `Selfie: ${reportedData?.selfie_url || 'N/A'}`,
                        '',
                        '═══════════════════════════════════',
                        'PRIMA PLATFORM INFORMATION',
                        '═══════════════════════════════════',
                        'Platform: PrimaPlug (primaplug.com)',
                        'Contact: admin@primaplug.com',
                        `Report Reference: ${report.id}`,
                      ].join('\n')

                      const blob = new Blob([packageText], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `prima-police-report-${report.id.substring(0, 8)}.txt`
                      a.click()

                      await supabase.from('emergency_reports').update({
                        police_data_generated: true,
                        police_data_generated_at: new Date().toISOString(),
                        status: 'actioned'
                      }).eq('id', report.id)
                      fetchTabData('emergency')
                    }} style={{ flex: 2, background: 'var(--color-text)', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      📋 Generate Police Package
                    </button>
                    <button onClick={async () => {
                      await supabase.from('emergency_reports').update({ status: 'dismissed' }).eq('id', report.id)
                      fetchTabData('emergency')
                    }} style={{ flex: 1, background: 'var(--color-page)', border: '1.5px solid var(--color-border)', borderRadius: '10px', padding: '12px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
    </div>
  )
}
