import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAdmin } from '../hooks/useAdmin'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import VerificationBadge from '../components/VerificationBadge'

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
  const [loadingData, setLoadingData] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loading && !isAdmin) navigate('/dashboard')
  }, [isAdmin, loading])

  useEffect(() => {
    if (isAdmin) {
      fetchOverview()
      fetchTabData(activeTab)
    }
  }, [isAdmin, activeTab])

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
          .select('*, users(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(100)
        setServices(servicesData || [])
        break
      case 'disputes':
        const { data: disputesData } = await supabase
          .from('receipts')
          .select('*, gigs(title), poster:users!receipts_poster_id_fkey(full_name, email), worker:users!receipts_worker_id_fkey(full_name, email)')
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
        const { data: reportsData } = await supabase
          .from('reports')
          .select(`
            *,
            reporter:users!reports_reporter_id_fkey(full_name, avatar_url),
            reported:users!reports_reported_user_id_fkey(full_name, avatar_url, email, phone, location, selfie_url)
          `)
          .order('created_at', { ascending: false })
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

  const banUser = async (userId) => {
    if (!window.confirm('Ban this user? They will not be able to log in.')) return
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

  const deleteGig = async (gigId) => {
    if (!window.confirm('Delete this gig?')) return
    await supabase.from('gigs').delete().eq('id', gigId)
    fetchTabData('gigs')
  }

  const resolveDispute = async (receiptId, favor) => {
    // favor = 'poster' or 'worker'
    await supabase
      .from('receipts')
      .update({
        disputed: false,
        dispute_reason: `Resolved in favor of ${favor}`,
        completed: favor === 'worker',
        status: 'resolved'
      })
      .eq('id', receiptId)

    await supabase.from('notifications').insert({
      user_id: favor === 'worker'
        ? disputes.find(d => d.id === receiptId)?.worker_id
        : disputes.find(d => d.id === receiptId)?.poster_id,
      title: '✅ Dispute Resolved',
      message: 'Your dispute has been reviewed and resolved by Prima admin.',
      type: 'general'
    })

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
      color: '#6C47FF', fontSize: '16px'
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

  return (
    <div style={{
      minHeight: '100vh', background: '#F8F7FF',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Top Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #14123A, #1E1B4B)',
        padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', position: 'sticky',
        top: 0, zIndex: 100,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px'
          }}>⚡</div>
          <div>
            <div style={{
              fontSize: '16px', fontWeight: '800', color: '#fff'
            }}>PrimaPlug Admin</div>
            <div style={{
              fontSize: '10px', color: 'rgba(255,255,255,0.5)',
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
              color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit'
            }}>← Back to App</button>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 69px)' }}>
        {/* Sidebar */}
        <div style={{
          width: '200px', background: '#fff',
          borderRight: '1.5px solid #E2E0FF',
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
                  ? '#EEE9FF' : 'transparent',
                border: `1.5px solid ${activeTab === tab.key ? '#B8A5FF' : 'transparent'}`,
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '13px', fontWeight: activeTab === tab.key ? '700' : '500',
                color: activeTab === tab.key ? '#6C47FF' : '#8B8FAF',
                cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', marginBottom: '4px',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.15s'
              }}>
              <span>{tab.icon}</span>
              <span>{tab.label.split(' ')[1]}</span>
              {tab.key === 'withdrawals' && stats?.pendingWithdrawals > 0 && (
                <span style={{
                  background: '#FFB800', color: '#fff',
                  borderRadius: '10px', padding: '1px 6px',
                  fontSize: '9px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: '800', marginLeft: 'auto'
                }}>{stats.pendingWithdrawals}</span>
              )}
              {tab.key === 'disputes' && stats?.openDisputes > 0 && (
                <span style={{
                  background: '#FF3366', color: '#fff',
                  borderRadius: '50%', width: '18px', height: '18px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '9px',
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
                color: '#14123A', marginBottom: '20px'
              }}>Platform Overview</div>

              {/* Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '14px', marginBottom: '24px'
              }}>
                {[
                  { label: 'Total Users', value: stats.totalUsers, icon: '👥', color: '#6C47FF', sub: `+${stats.newUsersThisWeek} this week` },
                  { label: 'Total Gigs', value: stats.totalGigs, icon: '⚡', color: '#FF6B2B', sub: `${stats.completedGigs} completed` },
                  { label: 'Services', value: stats.totalServices, icon: '🛠', color: '#0EA5E9', sub: 'Active listings' },
                  { label: 'Transactions', value: stats.totalReceipts, icon: '📎', color: '#00C48C', sub: `$${stats.totalValue?.toFixed(0)} total value` },
                  { label: 'Open Disputes', value: stats.openDisputes, icon: '⚠️', color: '#FF3366', sub: 'Needs review' },
                  { label: 'Completed Gigs', value: stats.completedGigs, icon: '✅', color: '#00C48C', sub: 'All time' },
                  { label: 'Pending Payouts', value: stats.pendingWithdrawals, icon: '💸', color: '#FFB800', sub: 'Withdrawal requests' },
                ].map(({ label, value, icon, color, sub }) => (
                  <div key={label} style={{
                    background: '#fff', border: '1.5px solid #E2E0FF',
                    borderRadius: '16px', padding: '18px'
                  }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
                    <div style={{
                      fontSize: '28px', fontWeight: '800',
                      color, marginBottom: '3px'
                    }}>{value?.toLocaleString() || 0}</div>
                    <div style={{
                      fontSize: '12px', fontWeight: '600',
                      color: '#14123A', marginBottom: '2px'
                    }}>{label}</div>
                    <div style={{ fontSize: '11px', color: '#A09DC8' }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Platform Value */}
              <div style={{
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                borderRadius: '20px', padding: '24px',
                color: '#fff', textAlign: 'center'
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
                  fontSize: '20px', fontWeight: '800', color: '#14123A'
                }}>Users ({users.length})</div>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search users..."
                  style={{
                    background: '#fff', border: '1.5px solid #E2E0FF',
                    borderRadius: '10px', padding: '8px 14px',
                    fontSize: '13px', color: '#14123A',
                    fontFamily: 'inherit', outline: 'none', width: '220px'
                  }}
                />
              </div>

              <div style={{
                background: '#fff', borderRadius: '16px',
                border: '1.5px solid #E2E0FF', overflow: 'hidden'
              }}>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr 1fr',
                  padding: '12px 16px',
                  background: '#F8F7FF',
                  borderBottom: '1px solid #E2E0FF',
                  fontSize: '10px', fontWeight: '700',
                  color: '#A09DC8', textTransform: 'uppercase',
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
                    color: '#A09DC8'
                  }}>Loading...</div>
                ) : filteredUsers.map((u, i) => (
                  <div key={u.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr 1fr',
                    padding: '12px 16px',
                    borderBottom: i < filteredUsers.length - 1
                      ? '1px solid #F5F4FF' : 'none',
                    alignItems: 'center', gap: '8px',
                    background: u.is_banned ? '#FFF5F5' : '#fff'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '8px',
                        background: '#EEE9FF', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '800',
                        color: '#6C47FF', overflow: 'hidden', flexShrink: 0
                      }}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : u.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div style={{
                          fontSize: '12px', fontWeight: '600',
                          color: '#14123A'
                        }}>{u.full_name || '—'}</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {u.is_verified && (
                            <VerificationBadge compact />
                          )}
                          {u.is_admin && (
                            <span style={{
                              fontSize: '8px', background: '#FFE8EE',
                              color: '#FF3366', borderRadius: '3px',
                              padding: '1px 4px', fontWeight: '700'
                            }}>ADMIN</span>
                          )}
                          {u.is_banned && (
                            <span style={{
                              fontSize: '8px', background: '#FFE8EE',
                              color: '#FF3366', borderRadius: '3px',
                              padding: '1px 4px', fontWeight: '700'
                            }}>BANNED</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '11px', color: '#8B8FAF',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>{u.email || '—'}</div>
                    <div style={{
                      fontSize: '12px', fontWeight: '700',
                      color: u.trust_score >= 80 ? '#00C48C' : '#FF3366'
                    }}>{u.trust_score || 100}%</div>
                    <div style={{
                      fontSize: '12px', color: '#14123A', fontWeight: '600'
                    }}>{u.gigs_completed || 0}</div>
                    <div style={{
                      fontSize: '11px', color: '#8B8FAF',
                      textTransform: 'capitalize'
                    }}>{u.level || 'new'}</div>
                    <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                      {timeAgo(u.joined_at)}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {!u.is_verified && !u.is_admin && (
                        <button
                          onClick={() => verifyUser(u.id)}
                          title="Verify User"
                          style={{
                            background: '#DFFDF4',
                            border: '1px solid #7EECD2',
                            borderRadius: '6px', padding: '4px 7px',
                            fontSize: '10px', fontWeight: '700',
                            color: '#00C48C', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>✓</button>
                      )}
                      {!u.is_admin && !u.is_banned && (
                        <button
                          onClick={() => banUser(u.id)}
                          title="Ban User"
                          style={{
                            background: '#FFE8EE',
                            border: '1px solid #FF99B3',
                            borderRadius: '6px', padding: '4px 7px',
                            fontSize: '10px', fontWeight: '700',
                            color: '#FF3366', cursor: 'pointer',
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
                            background: '#EEE9FF',
                            border: '1px solid #B8A5FF',
                            borderRadius: '6px', padding: '4px 7px',
                            fontSize: '10px', fontWeight: '700',
                            color: '#6C47FF', cursor: 'pointer',
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
                  fontSize: '20px', fontWeight: '800', color: '#14123A'
                }}>Gigs ({gigs.length})</div>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search gigs..."
                  style={{
                    background: '#fff', border: '1.5px solid #E2E0FF',
                    borderRadius: '10px', padding: '8px 14px',
                    fontSize: '13px', color: '#14123A',
                    fontFamily: 'inherit', outline: 'none', width: '220px'
                  }}
                />
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                {filteredGigs.map(gig => (
                  <div key={gig.id} style={{
                    background: '#fff', border: '1.5px solid #E2E0FF',
                    borderRadius: '14px', padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: '12px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px', fontWeight: '700',
                        color: '#14123A', marginBottom: '3px'
                      }}>{gig.title}</div>
                      <div style={{
                        fontSize: '11px', color: '#8B8FAF'
                      }}>
                        By {gig.users?.full_name || '—'} ·{' '}
                        ${gig.pay_min}–${gig.pay_max} ·{' '}
                        {gig.type} · {gig.field || '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        background: gig.status === 'open' ? '#DFFDF4'
                          : gig.status === 'completed' ? '#EEE9FF'
                            : '#FFF0E8',
                        border: `1px solid ${gig.status === 'open' ? '#7EECD2'
                          : gig.status === 'completed' ? '#B8A5FF'
                            : '#FFBC99'}`,
                        borderRadius: '6px', padding: '3px 9px',
                        fontSize: '10px', fontWeight: '700',
                        color: gig.status === 'open' ? '#00C48C'
                          : gig.status === 'completed' ? '#6C47FF'
                            : '#FF6B2B',
                        textTransform: 'capitalize'
                      }}>{gig.status}</span>
                      <div style={{
                        fontSize: '10px', color: '#A09DC8'
                      }}>{timeAgo(gig.created_at)}</div>
                      <button
                        onClick={() => deleteGig(gig.id)}
                        style={{
                          background: '#FFE8EE', border: '1px solid #FF99B3',
                          borderRadius: '7px', padding: '5px 9px',
                          fontSize: '11px', fontWeight: '700',
                          color: '#FF3366', cursor: 'pointer',
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
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: '#14123A', marginBottom: '16px'
              }}>Services ({services.length})</div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                {services.map(service => (
                  <div key={service.id} style={{
                    background: '#fff', border: '1.5px solid #E2E0FF',
                    borderRadius: '14px', padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: '12px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px', fontWeight: '700',
                        color: '#14123A', marginBottom: '3px'
                      }}>{service.title}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                        By {service.users?.full_name || '—'} ·{' '}
                        From ${service.basic_price} ·{' '}
                        {service.field || '—'} · {service.type}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        background: service.is_active ? '#DFFDF4' : '#FFE8EE',
                        border: `1px solid ${service.is_active ? '#7EECD2' : '#FF99B3'}`,
                        borderRadius: '6px', padding: '3px 9px',
                        fontSize: '10px', fontWeight: '700',
                        color: service.is_active ? '#00C48C' : '#FF3366'
                      }}>{service.is_active ? 'Active' : 'Inactive'}</span>
                      <button
                        onClick={async () => {
                          await supabase
                            .from('services')
                            .update({ is_active: !service.is_active })
                            .eq('id', service.id)
                          fetchTabData('services')
                        }}
                        style={{
                          background: '#EEE9FF', border: '1px solid #B8A5FF',
                          borderRadius: '7px', padding: '5px 9px',
                          fontSize: '11px', fontWeight: '700',
                          color: '#6C47FF', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>
                        {service.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Delete this service?')) return
                          await supabase.from('services').delete().eq('id', service.id)
                          fetchTabData('services')
                        }}
                        style={{
                          background: '#FFE8EE', border: '1px solid #FF99B3',
                          borderRadius: '7px', padding: '5px 9px',
                          fontSize: '11px', fontWeight: '700',
                          color: '#FF3366', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISPUTES TAB */}
          {activeTab === 'disputes' && (
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800',
                color: '#14123A', marginBottom: '16px'
              }}>
                Open Disputes ({disputes.length})
              </div>

              {disputes.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px',
                  background: '#fff', borderRadius: '16px',
                  border: '1.5px solid #E2E0FF'
                }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                  <div style={{
                    fontSize: '16px', fontWeight: '700', color: '#14123A'
                  }}>No open disputes</div>
                  <div style={{ fontSize: '13px', color: '#A09DC8', marginTop: '6px' }}>
                    All transactions are clean
                  </div>
                </div>
              ) : disputes.map(dispute => (
                <div key={dispute.id} style={{
                  background: '#fff', border: '1.5px solid #FF99B3',
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
                        color: '#14123A', marginBottom: '4px'
                      }}>{dispute.gigs?.title || 'Deleted Gig'}</div>
                      <div style={{ fontSize: '12px', color: '#8B8FAF' }}>
                        Amount: ${dispute.amount || '?'} ·{' '}
                        {timeAgo(dispute.created_at)}
                      </div>
                    </div>
                    <span style={{
                      background: '#FFE8EE', border: '1px solid #FF99B3',
                      borderRadius: '7px', padding: '4px 10px',
                      fontSize: '10px', fontWeight: '800', color: '#FF3366'
                    }}>⚠️ DISPUTED</span>
                  </div>

                  <div style={{
                    background: '#FFF5F5', borderRadius: '10px',
                    padding: '12px', marginBottom: '14px',
                    fontSize: '12px', color: '#FF3366', lineHeight: '1.5'
                  }}>
                    <strong>Dispute Reason:</strong>{' '}
                    {dispute.dispute_reason || 'No reason provided'}
                  </div>

                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '10px', marginBottom: '14px'
                  }}>
                    <div style={{
                      background: '#F5F4FF', borderRadius: '10px', padding: '12px'
                    }}>
                      <div style={{
                        fontSize: '10px', color: '#A09DC8', fontWeight: '700',
                        textTransform: 'uppercase', marginBottom: '4px'
                      }}>Poster (Client)</div>
                      <div style={{
                        fontSize: '13px', fontWeight: '600', color: '#14123A'
                      }}>{dispute.poster?.full_name || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                        {dispute.poster?.email}
                      </div>
                      {dispute.poster_receipt_url && (
                        <a href={dispute.poster_receipt_url}
                          target="_blank" rel="noreferrer"
                          style={{
                            display: 'inline-block', marginTop: '6px',
                            fontSize: '11px', color: '#6C47FF',
                            fontWeight: '600'
                          }}>View Receipt →</a>
                      )}
                    </div>
                    <div style={{
                      background: '#F5F4FF', borderRadius: '10px', padding: '12px'
                    }}>
                      <div style={{
                        fontSize: '10px', color: '#A09DC8', fontWeight: '700',
                        textTransform: 'uppercase', marginBottom: '4px'
                      }}>Worker</div>
                      <div style={{
                        fontSize: '13px', fontWeight: '600', color: '#14123A'
                      }}>{dispute.worker?.full_name || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                        {dispute.worker?.email}
                      </div>
                      {dispute.worker_receipt_url && (
                        <a href={dispute.worker_receipt_url}
                          target="_blank" rel="noreferrer"
                          style={{
                            display: 'inline-block', marginTop: '6px',
                            fontSize: '11px', color: '#6C47FF',
                            fontWeight: '600'
                          }}>View Receipt →</a>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => resolveDispute(dispute.id, 'poster')}
                      style={{
                        flex: 1, background: '#EEE9FF',
                        border: '1.5px solid #B8A5FF',
                        borderRadius: '10px', padding: '11px',
                        fontSize: '12px', fontWeight: '700',
                        color: '#6C47FF', cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}>✓ Favor Poster</button>
                    <button
                      onClick={() => resolveDispute(dispute.id, 'worker')}
                      style={{
                        flex: 1, background: '#DFFDF4',
                        border: '1.5px solid #7EECD2',
                        borderRadius: '10px', padding: '11px',
                        fontSize: '12px', fontWeight: '700',
                        color: '#00C48C', cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}>✓ Favor Worker</button>
                    <button
                      onClick={async () => {
                        await supabase
                          .from('receipts')
                          .update({ disputed: false, status: 'pending' })
                          .eq('id', dispute.id)
                        fetchTabData('disputes')
                      }}
                      style={{
                        background: '#F5F4FF',
                        border: '1.5px solid #E2E0FF',
                        borderRadius: '10px', padding: '11px 14px',
                        fontSize: '12px', fontWeight: '700',
                        color: '#8B8FAF', cursor: 'pointer',
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
                color: '#14123A', marginBottom: '16px'
              }}>Withdrawal Requests ({withdrawals.length})</div>
              {withdrawals.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px',
                  color: '#A09DC8', fontSize: '14px'
                }}>No withdrawal requests yet</div>
              ) : withdrawals.map(w => (
                <div key={w.id} style={{
                  background: '#fff', border: '1.5px solid #E2E0FF',
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '10px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '8px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '14px', fontWeight: '700', color: '#14123A'
                      }}>{w.users?.full_name || 'Unknown'}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                        {w.users?.email}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '16px', fontWeight: '800', color: '#00C48C'
                      }}>${w.dollar_amount?.toFixed(2)}</div>
                      <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                        {w.credits_amount} credits
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', gap: '8px', flexWrap: 'wrap',
                    marginBottom: '10px'
                  }}>
                    <span style={{
                      background: '#EEE9FF', border: '1px solid #B8A5FF',
                      borderRadius: '6px', padding: '3px 8px',
                      fontSize: '11px', fontWeight: '700', color: '#6C47FF'
                    }}>{w.method?.toUpperCase()}</span>
                    <span style={{
                      background: w.status === 'pending' ? '#FFF8E0' : w.status === 'paid' ? '#DFFDF4' : '#FFE8EE',
                      border: `1px solid ${w.status === 'pending' ? '#FFD966' : w.status === 'paid' ? '#7EECD2' : '#FF99B3'}`,
                      borderRadius: '6px', padding: '3px 8px',
                      fontSize: '11px', fontWeight: '700',
                      color: w.status === 'pending' ? '#FFB800' : w.status === 'paid' ? '#00C48C' : '#FF3366'
                    }}>{w.status?.toUpperCase()}</span>
                    <span style={{ fontSize: '11px', color: '#A09DC8' }}>
                      {new Date(w.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{
                    background: '#F5F4FF', borderRadius: '8px',
                    padding: '8px 12px', fontSize: '12px',
                    color: '#5B5887', marginBottom: '10px'
                  }}>
                    <strong>Account:</strong> {w.account_details}
                  </div>
                  {w.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm(
                            `Confirm payment of $${w.dollar_amount?.toFixed(2)} to ${w.users?.full_name || 'user'}?\n\nMake sure you have already sent this payment via Fincra or directly before confirming.`
                          )
                          if (!confirmed) return

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
                        }}
                        style={{
                          flex: 2, background: '#DFFDF4',
                          border: '1.5px solid #7EECD2',
                          borderRadius: '10px', padding: '10px',
                          fontSize: '13px', fontWeight: '700',
                          color: '#00C48C', cursor: 'pointer',
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
                          flex: 1, background: '#FFE8EE',
                          border: '1.5px solid #FF99B3',
                          borderRadius: '8px', padding: '8px',
                          fontSize: '12px', fontWeight: '700',
                          color: '#FF3366', cursor: 'pointer',
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
                color: '#14123A', marginBottom: '16px'
              }}>All Receipts ({receipts.length})</div>

              <div style={{
                background: '#fff', borderRadius: '16px',
                border: '1.5px solid #E2E0FF', overflow: 'hidden'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '12px 16px', background: '#F8F7FF',
                  borderBottom: '1px solid #E2E0FF',
                  fontSize: '10px', fontWeight: '700',
                  color: '#A09DC8', textTransform: 'uppercase',
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
                      ? '1px solid #F5F4FF' : 'none',
                    alignItems: 'center', gap: '8px'
                  }}>
                    <div style={{
                      fontSize: '12px', fontWeight: '600',
                      color: '#14123A', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{receipt.gigs?.title || 'Deleted'}</div>
                    <div style={{
                      fontSize: '11px', color: '#8B8FAF'
                    }}>{receipt.poster?.full_name || '—'}</div>
                    <div style={{
                      fontSize: '11px', color: '#8B8FAF'
                    }}>{receipt.worker?.full_name || '—'}</div>
                    <div style={{
                      fontSize: '12px', fontWeight: '700', color: '#00C48C'
                    }}>${receipt.amount || '—'}</div>
                    <span style={{
                      background: receipt.completed ? '#DFFDF4'
                        : receipt.disputed ? '#FFE8EE' : '#FFF0E8',
                      border: `1px solid ${receipt.completed ? '#7EECD2'
                        : receipt.disputed ? '#FF99B3' : '#FFBC99'}`,
                      borderRadius: '5px', padding: '2px 7px',
                      fontSize: '9px', fontWeight: '700',
                      color: receipt.completed ? '#00C48C'
                        : receipt.disputed ? '#FF3366' : '#FF6B2B',
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
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A', marginBottom: '16px' }}>
                Reports ({reports.length})
              </div>
              {reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', background: '#fff', borderRadius: '16px', border: '1.5px solid #E2E0FF' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#14123A' }}>No reports</div>
                </div>
              ) : reports.map(report => (
                <div key={report.id} style={{ background: '#fff', border: '1.5px solid #E2E0FF', borderRadius: '16px', padding: '18px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#14123A', marginBottom: '3px' }}>
                        {report.reason.replace(/_/g, ' ').toUpperCase()}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                        {report.type} report · {timeAgo(report.created_at)}
                      </div>
                    </div>
                    <span style={{
                      background: report.status === 'pending' ? '#FFF8E0' : report.status === 'actioned' ? '#DFFDF4' : '#F5F4FF',
                      border: `1px solid ${report.status === 'pending' ? '#FFD966' : report.status === 'actioned' ? '#7EECD2' : '#E2E0FF'}`,
                      borderRadius: '6px', padding: '3px 9px',
                      fontSize: '10px', fontWeight: '700',
                      color: report.status === 'pending' ? '#FFB800' : report.status === 'actioned' ? '#00C48C' : '#8B8FAF',
                      textTransform: 'capitalize'
                    }}>{report.status}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: '#F5F4FF', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#A09DC8', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Reporter (Anonymous)</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#14123A' }}>Hidden from reported user</div>
                    </div>
                    <div style={{ background: '#FFE8EE', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#FF3366', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Reported User</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A' }}>{report.reported?.full_name || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{report.reported?.email}</div>
                    </div>
                  </div>

                  {report.details && (
                    <div style={{ background: '#F5F4FF', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '12px', color: '#5B5887', lineHeight: '1.6' }}>
                      {report.details}
                    </div>
                  )}

                  {report.reported?.selfie_url && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '10px', color: '#A09DC8', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>Reported User Selfie</div>
                      <img src={report.reported.selfie_url} alt="Reported user selfie"
                        style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', border: '2px solid #E2E0FF' }} />
                    </div>
                  )}

                  {report.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={async () => {
                        await supabase.from('reports').update({ status: 'reviewed' }).eq('id', report.id)
                        fetchTabData('reports')
                      }} style={{ flex: 1, background: '#EEE9FF', border: '1.5px solid #B8A5FF', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Mark Reviewed
                      </button>
                      <button onClick={async () => {
                        await supabase.from('users').update({ reverification_required: true }).eq('id', report.reported_user_id)
                        await supabase.from('reports').update({ status: 'actioned' }).eq('id', report.id)
                        await supabase.from('notifications').insert({
                          user_id: report.reported_user_id,
                          title: '⚠️ Verification Required',
                          message: 'Your account requires re-verification. Please update your selfie to continue using Prima.',
                          type: 'general'
                        })
                        fetchTabData('reports')
                      }} style={{ flex: 1, background: '#FFF0E8', border: '1.5px solid #FFBC99', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: '#FF6B2B', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Require Re-verify
                      </button>
                      <button onClick={async () => {
                        await supabase.from('reports').update({ status: 'dismissed' }).eq('id', report.id)
                        fetchTabData('reports')
                      }} style={{ flex: 1, background: '#F5F4FF', border: '1.5px solid #E2E0FF', borderRadius: '10px', padding: '10px', fontSize: '12px', fontWeight: '700', color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit' }}>
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
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A', marginBottom: '16px' }}>
                Emergency Reports ({emergencyReports.length})
              </div>
              {emergencyReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', background: '#fff', borderRadius: '16px', border: '1.5px solid #E2E0FF' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#14123A' }}>No emergency reports</div>
                </div>
              ) : emergencyReports.map(report => (
                <div key={report.id} style={{ background: '#fff', border: `1.5px solid ${report.status === 'pending' ? '#FF99B3' : '#E2E0FF'}`, borderRadius: '16px', padding: '18px', marginBottom: '12px' }}>
                  {report.status === 'pending' && (
                    <div style={{ background: '#FF3366', color: '#fff', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: '700', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🆘 URGENT — Requires Immediate Attention
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: '#F5F4FF', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#A09DC8', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Filed by</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A', marginBottom: '3px' }}>{report.reporter?.full_name}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{report.reporter?.email}</div>
                      <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{report.reporter?.phone}</div>
                    </div>
                    {report.reported && (
                      <div style={{ background: '#FFE8EE', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '10px', color: '#FF3366', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>Reported Person</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#14123A', marginBottom: '3px' }}>{report.reported?.full_name}</div>
                        <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{report.reported?.email}</div>
                      </div>
                    )}
                  </div>

                  {report.location_lat && (
                    <div style={{ background: '#DFFDF4', border: '1px solid #7EECD2', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#00C48C', fontWeight: '600' }}>
                        📍 {report.location_lat.toFixed(6)}, {report.location_lng.toFixed(6)}
                      </span>
                      <a href={`https://maps.google.com/?q=${report.location_lat},${report.location_lng}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: '11px', color: '#6C47FF', fontWeight: '700', textDecoration: 'none' }}>
                        Open in Maps →
                      </a>
                    </div>
                  )}

                  <div style={{ background: '#FFF5F5', border: '1px solid #FFD0D0', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '13px', color: '#14123A', lineHeight: '1.6' }}>
                    {report.description}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                    {report.reporter?.selfie_url && (
                      <div>
                        <div style={{ fontSize: '10px', color: '#A09DC8', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Reporter Selfie</div>
                        <img src={report.reporter.selfie_url} alt="" style={{ width: '70px', height: '70px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #E2E0FF' }} />
                      </div>
                    )}
                    {report.reported?.selfie_url && (
                      <div>
                        <div style={{ fontSize: '10px', color: '#FF3366', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Reported Selfie</div>
                        <img src={report.reported.selfie_url} alt="" style={{ width: '70px', height: '70px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #FF99B3' }} />
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
                    }} style={{ flex: 2, background: '#14123A', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      📋 Generate Police Package
                    </button>
                    <button onClick={async () => {
                      await supabase.from('emergency_reports').update({ status: 'dismissed' }).eq('id', report.id)
                      fetchTabData('emergency')
                    }} style={{ flex: 1, background: '#F5F4FF', border: '1.5px solid #E2E0FF', borderRadius: '10px', padding: '12px', fontSize: '12px', fontWeight: '700', color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
