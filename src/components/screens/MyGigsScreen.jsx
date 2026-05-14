import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { getCurrency } from '../../data/currencies'
import EditGig from '../EditGig'

const getCurrencySymbol = (code) => getCurrency(code || 'USD').symbol
import PublicProfile from '../PublicProfile'
import ReviewModal from '../ReviewModal'
import ReceiptFlow from '../ReceiptFlow'
import BrandIcon from '../BrandIcon'
import LiveTracking from '../LiveTracking'
import { playAccepted, playDeclined } from '../../utils/sounds'
import { sendPushToUser } from '../../utils/pushNotifications'

const STATUS_CONFIG = {
  open: { label: 'Open', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  in_progress: { label: 'In Progress', color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
  completed: { label: 'Completed', color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF' },
  cancelled: { label: 'Cancelled', color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' },
}

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open
  return (
    <span style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: '5px', padding: '2px 8px',
      fontSize: '9px', fontWeight: '700',
      color: cfg.color, letterSpacing: '0.8px'
    }}>{cfg.label}</span>
  )
}

// ── APPLICANT ROW ── completely standalone, no parent click interference
const ApplicantRow = ({ app, gig, onAccept, onDecline, onReview, onReceipt, onViewProfile }) => (
  <div style={{
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid #F0EEFF'
  }}>
    {/* Left */}
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <div
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onViewProfile(app.worker_id)
        }}
        style={{
          width: '44px', height: '44px',
          borderRadius: '12px', overflow: 'hidden',
          border: '2px solid #B8A5FF',
          cursor: 'pointer', flexShrink: 0,
          background: '#EEE9FF',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px', fontWeight: '800', color: '#6C47FF'
        }}>
        {app.users?.avatar_url
          ? <img src={app.users.avatar_url} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : app.users?.full_name?.charAt(0) || '?'
        }
      </div>
      <div>
        <div
          role="button"
          tabIndex={0}
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onViewProfile(app.worker_id)
          }}
          style={{
            fontSize: '13px', fontWeight: '700',
            color: '#6C47FF', cursor: 'pointer',
            marginBottom: '3px'
          }}>
          {app.users?.full_name || 'Unknown'} →
        </div>
        <div style={{ fontSize: '10px', color: '#A09DC8' }}>
          Trust: {app.users?.trust_score || 100}% ·{' '}
          <span style={{
            fontWeight: '700',
            color: app.status === 'accepted' ? '#00C48C'
              : app.status === 'rejected' ? '#FF3366' : '#FF6B2B',
            textTransform: 'capitalize'
          }}>
            {app.status}
          </span>
        </div>
      </div>
    </div>

    {/* Right — actions */}
    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
      {app.status === 'pending' && (
        <>
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onClick={() => onAccept(app)}
            style={{
              background: '#DFFDF4', border: '1.5px solid #7EECD2',
              borderRadius: '8px', padding: '8px 12px',
              fontSize: '12px', fontWeight: '700',
              color: '#00C48C', cursor: 'pointer', fontFamily: 'inherit'
            }}>✓ Accept</button>
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onClick={() => onDecline(app)}
            style={{
              background: '#FFE8EE', border: '1.5px solid #FF99B3',
              borderRadius: '8px', padding: '8px 12px',
              fontSize: '12px', fontWeight: '700',
              color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
            }}>✗ Decline</button>
        </>
      )}
      {app.status === 'accepted' && (
        <>
          <span style={{
            background: '#DFFDF4', border: '1.5px solid #7EECD2',
            borderRadius: '8px', padding: '7px 12px',
            fontSize: '11px', fontWeight: '700', color: '#00C48C'
          }}>✓ Accepted</span>
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onClick={() => onReceipt(app)}
            style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '8px', padding: '7px 10px',
              fontSize: '11px', fontWeight: '700',
              color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
            }}>📎</button>
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onClick={() => onReview(app)}
            style={{
              background: '#EEE9FF', border: '1.5px solid #B8A5FF',
              borderRadius: '8px', padding: '7px 10px',
              fontSize: '11px', fontWeight: '700',
              color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
            }}>⭐</button>
        </>
      )}
      {app.status === 'rejected' && (
        <span style={{
          background: '#FFE8EE', border: '1.5px solid #FF99B3',
          borderRadius: '8px', padding: '7px 12px',
          fontSize: '11px', fontWeight: '700', color: '#FF3366'
        }}>✗ Declined</span>
      )}
    </div>
  </div>
)

export default function MyGigsScreen() {
  const { user } = useAuth()
  const [tab, setTab] = useState('posted')
  const [postedGigs, setPostedGigs] = useState([])
  const [appliedGigs, setAppliedGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedGigId, setExpandedGigId] = useState(null)
  const [selectedGig, setSelectedGig] = useState(null)
  const [showReceiptFlow, setShowReceiptFlow] = useState(false)
  const [receiptUserRole, setReceiptUserRole] = useState('poster')
  const [receiptWorker, setReceiptWorker] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [showReview, setShowReview] = useState(false)
  const [reviewData, setReviewData] = useState(null)
  const [showTracking, setShowTracking] = useState(false)
  const [trackingGig, setTrackingGig] = useState(null)
  const [trackingRole, setTrackingRole] = useState('worker')
  const [trackingWorker, setTrackingWorker] = useState(null)
  const [editingGig, setEditingGig] = useState(null)

  useEffect(() => {
    fetchPostedGigs()
    fetchAppliedGigs()
  }, [user])

  const fetchPostedGigs = async () => {
    if (!user) return
    const { data } = await supabase
      .from('gigs')
      .select(`
        *,
        applications (
          id, status, worker_id,
          users ( id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location )
        )
      `)
      .eq('poster_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setPostedGigs(data)
    setLoading(false)
  }

  const fetchAppliedGigs = async () => {
    if (!user) return
    const { data } = await supabase
      .from('applications')
      .select('*, gigs(*, users(id, full_name, avatar_url, trust_score))')
      .eq('worker_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setAppliedGigs(data)
  }

  const handleAccept = async (app, gig) => {
    playAccepted()
    await supabase
      .from('applications')
      .update({ status: 'accepted' })
      .eq('id', app.id)

    const { data: accepted } = await supabase
      .from('applications')
      .select('id')
      .eq('gig_id', gig.id)
      .eq('status', 'accepted')

    const filled = accepted?.length || 0

    if (filled >= gig.slots) {
      await supabase
        .from('gigs')
        .update({ status: 'in_progress', slots_filled: filled })
        .eq('id', gig.id)
    } else {
      await supabase
        .from('gigs')
        .update({ slots_filled: filled })
        .eq('id', gig.id)
    }

    await supabase.from('notifications').insert({
      user_id: app.worker_id,
      title: 'Application Accepted! 🎉',
      message: `Your application for "${gig.title}" was accepted`,
      type: 'accepted',
      gig_id: gig.id
    })
    await sendPushToUser(
      app.worker_id,
      '🎉 Application Accepted!',
      `Your application for "${gig.title}" was accepted`,
      { type: 'accepted', gigId: gig.id }
    )

    fetchPostedGigs()
  }

  const handleDecline = async (app, gig) => {
    playDeclined()
    await supabase
      .from('applications')
      .update({ status: 'rejected' })
      .eq('id', app.id)

    await supabase.from('notifications').insert({
      user_id: app.worker_id,
      title: 'Application Update',
      message: `Your application for "${gig.title}" was not selected`,
      type: 'rejected',
      gig_id: gig.id
    })
    await sendPushToUser(
      app.worker_id,
      'Application Update',
      `Your application for "${gig.title}" was not selected`,
      { type: 'rejected', gigId: gig.id }
    )

    fetchPostedGigs()
  }

  const handleDeleteGig = async (gigId) => {
    if (!window.confirm('Delete this gig?')) return
    await supabase.from('gigs').delete().eq('id', gigId)
    fetchPostedGigs()
  }

  const handleReceiptUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !selectedGig) return
    setUploading(true)
    const fileName = `${user.id}-${selectedGig.id}-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage
      .from('receipts')
      .upload(fileName, file, { upsert: true })
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName)
    await supabase.from('receipts').upsert({
      gig_id: selectedGig.id,
      poster_id: selectedGig.poster_id,
      worker_id: user.id,
      worker_receipt_url: urlData.publicUrl,
      worker_confirmed: true,
    })
    setUploading(false)
    setShowReceiptModal(false)
    alert('Receipt uploaded!')
  }

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
          My Gigs
        </div>
        <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
          Track your posted and applied gigs
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '4px',
        background: '#fff', borderRadius: '14px',
        padding: '4px', border: '1.5px solid #E2E0FF',
        marginBottom: '20px'
      }}>
        {[
          { key: 'posted', label: `Posted (${postedGigs.length})` },
          { key: 'applied', label: `Applied (${appliedGigs.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1,
            background: tab === t.key ? '#6C47FF' : 'transparent',
            border: 'none', borderRadius: '10px',
            padding: '10px 4px', fontSize: '13px',
            fontWeight: tab === t.key ? '700' : '500',
            color: tab === t.key ? '#fff' : '#8B8FAF',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s'
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#A09DC8' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* ── POSTED GIGS ── */}
          {tab === 'posted' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {postedGigs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px',
                  background: '#fff', borderRadius: '16px',
                  border: '1.5px solid #E2E0FF'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                    <BrandIcon name="mygigs" size={46} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#14123A' }}>
                    No gigs posted yet
                  </div>
                </div>
              ) : postedGigs.map(gig => (
                <div key={gig.id} style={{
                  background: '#fff',
                  border: '1.5px solid #E2E0FF',
                  borderRadius: '16px', overflow: 'hidden'
                }}>

                  {/* Header — click to expand */}
                  <div
                    onClick={() => setExpandedGigId(
                      expandedGigId === gig.id ? null : gig.id
                    )}
                    style={{
                      padding: '16px 18px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      background: expandedGigId === gig.id ? '#F8F7FF' : '#fff',
                      userSelect: 'none'
                    }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '15px', fontWeight: '700',
                        color: '#14123A', marginBottom: '7px'
                      }}>{gig.title}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <StatusBadge status={gig.status} />
                        <span style={{
                          background: '#F5F4FF', border: '1px solid #E2E0FF',
                          borderRadius: '5px', padding: '2px 8px',
                          fontSize: '9px', fontWeight: '600', color: '#8B8FAF'
                        }}>
                          {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                        </span>
                        {gig.slots > 1 && (
                          <span style={{
                            background: '#DFFDF4', border: '1px solid #7EECD2',
                            borderRadius: '5px', padding: '2px 8px',
                            fontSize: '9px', fontWeight: '700', color: '#00C48C'
                          }}>
                            {gig.slots_filled || 0}/{gig.slots} slots
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '10px' }}>
                      <div style={{
                        fontSize: '15px', fontWeight: '800', color: '#00C48C'
                      }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
                      <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '2px' }}>
                        {new Date(gig.created_at).toLocaleDateString()}
                        {gig.expires_at && (
                          <span style={{
                            marginLeft: '6px',
                            color: new Date(gig.expires_at) < new Date(Date.now() + 86400000)
                              ? '#FF3366' : '#A09DC8'
                          }}>
                            · Expires {new Date(gig.expires_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric'
                            })}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '4px' }}>
                        {expandedGigId === gig.id ? '▲' : '▼'}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedGigId === gig.id && (
                    <div style={{
                      borderTop: '1px solid #E2E0FF',
                      padding: '14px 18px', background: '#F8F7FF'
                    }}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: '10px', marginBottom: '10px'
                      }}>
                        <div style={{
                          background: '#fff', borderRadius: '10px', padding: '10px'
                        }}>
                          <div style={{
                            fontSize: '9px', color: '#A09DC8', fontWeight: '700',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            marginBottom: '3px'
                          }}>Pay Range</div>
                          <div style={{
                            fontSize: '15px', fontWeight: '800', color: '#00C48C'
                          }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
                        </div>
                        <div style={{
                          background: '#fff', borderRadius: '10px', padding: '10px'
                        }}>
                          <div style={{
                            fontSize: '9px', color: '#A09DC8', fontWeight: '700',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            marginBottom: '3px'
                          }}>Field</div>
                          <div style={{
                            fontSize: '13px', fontWeight: '700', color: '#14123A'
                          }}>{gig.field || '—'}</div>
                        </div>
                      </div>
                      {gig.location && (
                        <div style={{
                          background: '#fff', borderRadius: '10px',
                          padding: '10px', marginBottom: '8px'
                        }}>
                          <div style={{
                            fontSize: '9px', color: '#A09DC8', fontWeight: '700',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            marginBottom: '4px'
                          }}>Location</div>
                          <div style={{
                            fontSize: '13px', fontWeight: '600', color: '#14123A'
                          }}>📍 {gig.location}</div>
                        </div>
                      )}
                      {gig.description && (
                        <div style={{
                          background: '#fff', borderRadius: '10px', padding: '10px'
                        }}>
                          <div style={{
                            fontSize: '9px', color: '#A09DC8', fontWeight: '700',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            marginBottom: '4px'
                          }}>Description</div>
                          <div style={{
                            fontSize: '12px', color: '#5B5887', lineHeight: '1.6'
                          }}>{gig.description}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Applicants — rendered as separate component, no parent click */}
                  {gig.applications && gig.applications.length > 0 && (
                    <div style={{
                      borderTop: '1px solid #E2E0FF',
                      padding: '12px 18px'
                    }}>
                      <div style={{
                        fontSize: '10px', fontWeight: '700', color: '#6C47FF',
                        textTransform: 'uppercase', letterSpacing: '0.8px',
                        marginBottom: '4px'
                      }}>
                        {gig.applications.length} Applicant{gig.applications.length !== 1 ? 's' : ''}
                      </div>
                      {gig.applications.map((app) => (
                        <div key={app.id}>
                          <ApplicantRow
                            app={app}
                            gig={gig}
                            onAccept={(a) => handleAccept(a, gig)}
                            onDecline={(a) => handleDecline(a, gig)}
                            onReceipt={(a) => {
                              setSelectedGig(gig)
                              setReceiptWorker({ id: a.worker_id, name: a.users?.full_name || 'Worker' })
                              setReceiptUserRole('poster')
                              setShowReceiptFlow(true)
                            }}
                            onReview={(a) => {
                              setReviewData({
                                gig,
                                revieweeId: a.worker_id,
                                revieweeName: a.users?.full_name || 'Worker',
                                reviewType: 'worker'
                              })
                              setShowReview(true)
                            }}
                            onViewProfile={(id) => setViewingProfile(id)}
                          />
                          {app.status === 'accepted' && gig.type === 'physical' && (
                            <button
                              onClick={() => {
                                setTrackingGig(gig)
                                setTrackingRole('poster')
                                setTrackingWorker(app.users)
                                setShowTracking(true)
                              }}
                              style={{
                                marginTop: '8px', width: '100%',
                                background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                                borderRadius: '10px', padding: '9px',
                                fontSize: '12px', fontWeight: '700', color: '#6C47FF',
                                cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: '6px'
                              }}>
                              📍 Track Worker
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bottom actions */}
                  <div style={{
                    borderTop: '1px solid #E2E0FF',
                    padding: '12px 18px',
                    display: 'flex', gap: '8px', justifyContent: 'flex-end'
                  }}>
                    <button
                      onClick={() => setEditingGig(gig)}
                      style={{
                        background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                        borderRadius: '10px', padding: '10px 14px',
                        fontSize: '13px', fontWeight: '700',
                        color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
                      }}>✏️ Edit</button>
                    <button
                      onClick={() => handleDeleteGig(gig.id)}
                      style={{
                        background: '#FFE8EE', border: '1.5px solid #FF99B3',
                        borderRadius: '10px', padding: '10px 14px',
                        fontSize: '13px', fontWeight: '700',
                        color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
                      }}>🗑 Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── APPLIED GIGS ── */}
          {tab === 'applied' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {appliedGigs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px',
                  background: '#fff', borderRadius: '16px',
                  border: '1.5px solid #E2E0FF'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                    <BrandIcon name="feed" size={46} />
                  </div>
                  <div style={{
                    fontSize: '15px', fontWeight: '700',
                    color: '#14123A', marginBottom: '6px'
                  }}>No applications yet</div>
                  <div style={{ fontSize: '13px', color: '#A09DC8' }}>
                    Browse the Feed and apply for gigs
                  </div>
                </div>
              ) : appliedGigs.map(app => (
                <div key={app.id} style={{
                  background: '#fff', border: '1.5px solid #E2E0FF',
                  borderRadius: '16px', padding: '18px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '10px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '15px', fontWeight: '700',
                        color: '#14123A', marginBottom: '6px'
                      }}>{app.gigs?.title || 'Gig'}</div>
                      <span style={{
                        background: app.status === 'accepted' ? '#DFFDF4'
                          : app.status === 'rejected' ? '#FFE8EE' : '#EEE9FF',
                        border: `1px solid ${app.status === 'accepted' ? '#7EECD2'
                          : app.status === 'rejected' ? '#FF99B3' : '#B8A5FF'}`,
                        borderRadius: '5px', padding: '2px 8px',
                        fontSize: '9px', fontWeight: '700',
                        color: app.status === 'accepted' ? '#00C48C'
                          : app.status === 'rejected' ? '#FF3366' : '#6C47FF',
                        letterSpacing: '0.8px', textTransform: 'uppercase'
                      }}>
                        {app.status === 'accepted' ? '✓ Accepted'
                          : app.status === 'rejected' ? '✗ Declined' : '⏳ Pending'}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '15px', fontWeight: '800', color: '#00C48C'
                    }}>
                      {getCurrencySymbol(app.gigs?.currency)}{app.gigs?.pay_min}–{getCurrencySymbol(app.gigs?.currency)}{app.gigs?.pay_max}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                    Posted by {app.gigs?.users?.full_name || 'Unknown'} ·{' '}
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </div>
                  {app.status === 'accepted' && (
                    <button
                      onClick={() => {
                        setSelectedGig(app.gigs)
                        setReceiptUserRole('worker')
                        setShowReceiptFlow(true)
                      }}
                      style={{
                        marginTop: '12px', width: '100%',
                        background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                        borderRadius: '10px', padding: '10px',
                        fontSize: '12px', fontWeight: '700',
                        color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
                      }}>📎 Upload Completion Receipt</button>
                  )}
                  {app.status === 'accepted' && app.gigs?.type === 'physical' && (
                    <button
                      onClick={() => {
                        setTrackingGig(app.gigs)
                        setTrackingRole('worker')
                        setTrackingWorker(null)
                        setShowTracking(true)
                      }}
                      style={{
                        marginTop: '10px', width: '100%',
                        background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                        border: 'none', borderRadius: '12px', padding: '12px',
                        fontSize: '13px', fontWeight: '700', color: '#fff',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '8px',
                        boxShadow: '0 4px 16px rgba(108,71,255,0.35)'
                      }}>
                      🧭 Navigate to Gig
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Receipt Flow */}
      {showReceiptFlow && selectedGig && (
        <ReceiptFlow
          gig={selectedGig}
          userRole={receiptUserRole}
          workerId={receiptUserRole === 'poster' ? receiptWorker?.id : user.id}
          onClose={() => {
            setShowReceiptFlow(false)
            setSelectedGig(null)
            setReceiptWorker(null)
          }}
          onComplete={() => {
            setShowReceiptFlow(false)
            setReceiptWorker(null)
            fetchPostedGigs()
            fetchAppliedGigs()
          }}
        />
      )}

      {/* Review Modal */}
      {showReview && reviewData && (
        <ReviewModal
          gig={reviewData.gig}
          revieweeId={reviewData.revieweeId}
          revieweeName={reviewData.revieweeName}
          reviewType={reviewData.reviewType}
          onClose={() => setShowReview(false)}
          onDone={() => { setShowReview(false); fetchPostedGigs() }}
        />
      )}

      {/* Public Profile */}
      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      {/* Live Tracking */}
      {showTracking && trackingGig && (
        <LiveTracking
          gig={trackingGig}
          role={trackingRole}
          workerInfo={trackingWorker}
          posterInfo={trackingRole === 'worker'
            ? trackingGig.users
            : null}
          onClose={() => {
            setShowTracking(false)
            setTrackingGig(null)
          }}
        />
      )}

      {/* Edit Gig Modal */}
      {editingGig && (
        <EditGig
          gig={editingGig}
          onClose={() => setEditingGig(null)}
          onSaved={() => {
            setEditingGig(null)
            fetchPostedGigs()
          }}
        />
      )}
    </div>
  )
}
