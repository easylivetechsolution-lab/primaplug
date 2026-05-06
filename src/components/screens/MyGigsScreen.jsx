import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PublicProfile from '../PublicProfile'

const STATUS_CONFIG = {
  open: { label: 'Open', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  in_progress: { label: 'In Progress', color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
  completed: { label: 'Completed', color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF' },
  cancelled: { label: 'Cancelled', color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' },
}

export default function MyGigsScreen() {
  const { user } = useAuth()
  const [tab, setTab] = useState('posted')
  const [postedGigs, setPostedGigs] = useState([])
  const [appliedGigs, setAppliedGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGig, setSelectedGig] = useState(null)
  const [expandedGig, setExpandedGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  useEffect(() => {
    fetchPostedGigs()
    fetchAppliedGigs()
  }, [user])

  const fetchPostedGigs = async () => {
    if (!user) return
    const { data } = await supabase
      .from('gigs')
      .select('*, applications(id, status, users(full_name, avatar_url, trust_score))')
      .eq('poster_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setPostedGigs(data)
    setLoading(false)
  }

  const fetchAppliedGigs = async () => {
    if (!user) return
    const { data } = await supabase
      .from('applications')
      .select('*, gigs(*, users(full_name, avatar_url))')
      .eq('worker_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setAppliedGigs(data)
  }

  const handleDeleteGig = async (gigId) => {
    if (!window.confirm('Are you sure you want to delete this gig?')) return
    await supabase.from('gigs').delete().eq('id', gigId)
    fetchPostedGigs()
  }

  const handleReceiptUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !selectedGig) return
    setUploading(true)

    const fileName = `${user.id}-${selectedGig.id}-${Date.now()}.${file.name.split('.').pop()}`
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

    await supabase.from('receipts').upsert({
      gig_id: selectedGig.id,
      poster_id: selectedGig.poster_id,
      worker_id: user.id,
      worker_receipt_url: urlData.publicUrl,
      worker_confirmed: true,
    })

    setUploading(false)
    setShowReceiptModal(false)
    alert('Receipt uploaded successfully! Waiting for the other party to confirm.')
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

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '22px', fontWeight: '800',
          color: '#14123A', marginBottom: '4px'
        }}>My Gigs</div>
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
        <div style={{
          textAlign: 'center', padding: '48px',
          color: '#A09DC8', fontSize: '14px'
        }}>Loading your gigs...</div>
      ) : (
        <>
          {/* POSTED GIGS */}
          {tab === 'posted' && (
            <div>
              {postedGigs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px 20px',
                  background: '#fff', borderRadius: '16px',
                  border: '1.5px solid #E2E0FF'
                }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                  <div style={{
                    fontSize: '15px', fontWeight: '700',
                    color: '#14123A', marginBottom: '6px'
                  }}>No gigs posted yet</div>
                  <div style={{ fontSize: '13px', color: '#A09DC8' }}>
                    Click Post a Gig to get started
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '12px'
                }}>
                  {postedGigs.map(gig => (
                    <div key={gig.id} style={{
                      background: '#fff', border: '1.5px solid #E2E0FF',
                      borderRadius: '16px', padding: '18px'
                    }}>
                      {/* Gig Header — clickable to expand */}
                      <div
                        onClick={() => setExpandedGig(
                          expandedGig?.id === gig.id ? null : gig
                        )}
                        style={{ cursor: 'pointer' }}
                      >
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', marginBottom: '8px'
                        }}>
                          <div style={{ flex: 1, paddingRight: '10px' }}>
                            <div style={{
                              fontSize: '15px', fontWeight: '700',
                              color: '#14123A', marginBottom: '6px',
                              display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              {gig.title}
                              <span style={{ fontSize: '12px', color: '#A09DC8', marginLeft: '8px' }}>
                                {expandedGig?.id === gig.id ? '▲' : '▼'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <StatusBadge status={gig.status} />
                              <span style={{
                                background: '#F5F4FF', border: '1px solid #E2E0FF',
                                borderRadius: '5px', padding: '2px 8px',
                                fontSize: '9px', fontWeight: '600', color: '#8B8FAF'
                              }}>
                                {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: '16px', fontWeight: '800', color: '#00C48C'
                            }}>${gig.pay_min}–${gig.pay_max}</div>
                            <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                              {new Date(gig.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Detail — NOT clickable */}
                      {expandedGig?.id === gig.id && (
                        <div style={{
                          background: '#F5F4FF', borderRadius: '12px',
                          padding: '14px', marginTop: '10px',
                          border: '1.5px solid #E2E0FF',
                          marginBottom: '12px'
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
                                fontSize: '16px', fontWeight: '800', color: '#00C48C'
                              }}>${gig.pay_min}–${gig.pay_max}</div>
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
                              padding: '10px', marginBottom: '10px'
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

                          {(gig.house_number || gig.street || gig.landmark) && (
                            <div style={{
                              background: '#fff', borderRadius: '10px',
                              padding: '10px', marginBottom: '10px',
                              border: '1px solid #B8A5FF'
                            }}>
                              <div style={{
                                fontSize: '9px', color: '#6C47FF', fontWeight: '700',
                                textTransform: 'uppercase', letterSpacing: '0.5px',
                                marginBottom: '8px'
                              }}>🔒 Exact Address</div>
                              {gig.house_number && (
                                <div style={{
                                  fontSize: '12px', color: '#14123A', marginBottom: '3px'
                                }}>🏠 {gig.house_number}</div>
                              )}
                              {gig.street && (
                                <div style={{
                                  fontSize: '12px', color: '#14123A', marginBottom: '3px'
                                }}>🛣 {gig.street}</div>
                              )}
                              {gig.landmark && (
                                <div style={{
                                  fontSize: '12px', color: '#14123A', marginBottom: '3px'
                                }}>🏛 Near {gig.landmark}</div>
                              )}
                              {gig.directions && (
                                <div style={{
                                  fontSize: '11px', color: '#8B8FAF',
                                  marginTop: '4px', lineHeight: '1.5'
                                }}>📋 {gig.directions}</div>
                              )}
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

                      {/* Applicants — completely separate from expand click */}
                      {gig.applications && gig.applications.length > 0 && (
                        <div style={{
                          background: '#F5F4FF', borderRadius: '10px',
                          padding: '12px', marginBottom: '12px'
                        }}>
                          <div style={{
                            fontSize: '10px', fontWeight: '700',
                            color: '#6C47FF', textTransform: 'uppercase',
                            letterSpacing: '0.8px', marginBottom: '10px'
                          }}>
                            {gig.applications.length} Applicant{gig.applications.length !== 1 ? 's' : ''}
                          </div>
                          {gig.applications.map((app, i) => (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', padding: '8px 0',
                              borderBottom: i < gig.applications.length - 1
                                ? '1px solid #E2E0FF' : 'none'
                            }}>
                              <div style={{
                                display: 'flex', gap: '10px', alignItems: 'center'
                              }}>
                                <div
                                  onClick={() => setViewingProfile(app.worker_id)}
                                  style={{
                                    width: '38px', height: '38px',
                                    borderRadius: '10px', background: '#EEE9FF',
                                    display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '14px',
                                    fontWeight: '800', color: '#6C47FF',
                                    overflow: 'hidden', cursor: 'pointer',
                                    border: '2px solid #B8A5FF', flexShrink: 0
                                  }}>
                                  {app.users?.avatar_url ? (
                                    <img src={app.users.avatar_url} alt=""
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    app.users?.full_name?.charAt(0) || '?'
                                  )}
                                </div>
                                <div>
                                  <div
                                    onClick={() => setViewingProfile(app.worker_id)}
                                    style={{
                                      fontSize: '13px', fontWeight: '700',
                                      color: '#6C47FF', cursor: 'pointer',
                                      marginBottom: '2px'
                                    }}>
                                    {app.users?.full_name || 'Unknown'} →
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                                    Trust: {app.users?.trust_score || 100}% ·{' '}
                                    <span style={{
                                      color: app.status === 'accepted'
                                        ? '#00C48C' : app.status === 'rejected'
                                          ? '#FF3366' : '#FF6B2B',
                                      fontWeight: '600', textTransform: 'capitalize'
                                    }}>
                                      {app.status}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {app.status === 'pending' && (
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                  <button
                                    onClick={async () => {
                                      await supabase
                                        .from('applications')
                                        .update({ status: 'accepted' })
                                        .eq('id', app.id)
                                      await supabase
                                        .from('gigs')
                                        .update({ status: 'in_progress' })
                                        .eq('id', gig.id)
                                      fetchPostedGigs()
                                    }}
                                    style={{
                                      background: '#DFFDF4',
                                      border: '1.5px solid #7EECD2',
                                      borderRadius: '8px', padding: '7px 12px',
                                      fontSize: '12px', fontWeight: '700',
                                      color: '#00C48C', cursor: 'pointer',
                                      fontFamily: 'inherit', whiteSpace: 'nowrap'
                                    }}>✓ Accept</button>
                                  <button
                                    onClick={async () => {
                                      await supabase
                                        .from('applications')
                                        .update({ status: 'rejected' })
                                        .eq('id', app.id)
                                      fetchPostedGigs()
                                    }}
                                    style={{
                                      background: '#FFE8EE',
                                      border: '1.5px solid #FF99B3',
                                      borderRadius: '8px', padding: '7px 12px',
                                      fontSize: '12px', fontWeight: '700',
                                      color: '#FF3366', cursor: 'pointer',
                                      fontFamily: 'inherit', whiteSpace: 'nowrap'
                                    }}>✗ Decline</button>
                                </div>
                              )}

                              {app.status === 'accepted' && (
                                <span style={{
                                  background: '#DFFDF4', border: '1.5px solid #7EECD2',
                                  borderRadius: '8px', padding: '6px 12px',
                                  fontSize: '11px', fontWeight: '700', color: '#00C48C'
                                }}>✓ Accepted</span>
                              )}

                              {app.status === 'rejected' && (
                                <span style={{
                                  background: '#FFE8EE', border: '1.5px solid #FF99B3',
                                  borderRadius: '8px', padding: '6px 12px',
                                  fontSize: '11px', fontWeight: '700', color: '#FF3366'
                                }}>✗ Declined</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bottom Actions */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setSelectedGig(gig)
                            setShowReceiptModal(true)
                          }}
                          style={{
                            flex: 1, background: '#EEE9FF',
                            border: '1.5px solid #B8A5FF',
                            borderRadius: '10px', padding: '10px',
                            fontSize: '12px', fontWeight: '700',
                            color: '#6C47FF', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>📎 Upload Receipt</button>
                        <button
                          onClick={() => handleDeleteGig(gig.id)}
                          style={{
                            background: '#FFE8EE', border: '1.5px solid #FF99B3',
                            borderRadius: '10px', padding: '10px 14px',
                            fontSize: '12px', fontWeight: '700',
                            color: '#FF3366', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* APPLIED GIGS */}
          {tab === 'applied' && (
            <div>
              {appliedGigs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px 20px',
                  background: '#fff', borderRadius: '16px',
                  border: '1.5px solid #E2E0FF'
                }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚡</div>
                  <div style={{
                    fontSize: '15px', fontWeight: '700',
                    color: '#14123A', marginBottom: '6px'
                  }}>No applications yet</div>
                  <div style={{ fontSize: '13px', color: '#A09DC8' }}>
                    Browse the Feed and apply for gigs
                  </div>
                </div>
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '12px'
                }}>
                  {appliedGigs.map(app => (
                    <div key={app.id} style={{
                      background: '#fff', border: '1.5px solid #E2E0FF',
                      borderRadius: '16px', padding: '18px'
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', marginBottom: '10px'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div
  onClick={() => setExpandedGig(expandedGig?.id === gig.id ? null : gig)}
  style={{
    fontSize: '15px', fontWeight: '700',
    color: '#14123A', marginBottom: '6px',
    cursor: 'pointer', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center'
  }}>
  {gig.title}
  <span style={{ fontSize: '12px', color: '#A09DC8' }}>
    {expandedGig?.id === gig.id ? '▲' : '▼'}
  </span>
</div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <span style={{
                              background: app.status === 'accepted'
                                ? '#DFFDF4' : app.status === 'rejected'
                                  ? '#FFE8EE' : '#EEE9FF',
                              border: `1px solid ${app.status === 'accepted'
                                ? '#7EECD2' : app.status === 'rejected'
                                  ? '#FF99B3' : '#B8A5FF'}`,
                              borderRadius: '5px', padding: '2px 8px',
                              fontSize: '9px', fontWeight: '700',
                              color: app.status === 'accepted'
                                ? '#00C48C' : app.status === 'rejected'
                                  ? '#FF3366' : '#6C47FF',
                              letterSpacing: '0.8px', textTransform: 'uppercase'
                            }}>
                              {app.status === 'accepted' ? '✓ Accepted'
                                : app.status === 'rejected' ? '✗ Declined'
                                  : '⏳ Pending'}
                            </span>
                          </div>
                        </div>
                        <div style={{
                          fontSize: '16px', fontWeight: '800',
                          color: '#00C48C'
                        }}>
                          ${app.gigs?.pay_min}–${app.gigs?.pay_max}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '11px', color: '#8B8FAF'
                      }}>
                        Posted by {app.gigs?.users?.full_name || 'Unknown'} ·{' '}
                        Applied {new Date(app.created_at).toLocaleDateString()}
                      </div>
                      {app.status === 'accepted' && (
                        <button
                          onClick={() => {
                            setSelectedGig(app.gigs)
                            setShowReceiptModal(true)
                          }}
                          style={{
                            marginTop: '12px', width: '100%',
                            background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                            borderRadius: '10px', padding: '10px',
                            fontSize: '12px', fontWeight: '700',
                            color: '#6C47FF', cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}>📎 Upload Completion Receipt</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* RECEIPT UPLOAD MODAL */}
      {showReceiptModal && selectedGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 400,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '20px'
        }} onClick={() => setShowReceiptModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '24px',
            padding: '28px', width: '100%', maxWidth: '440px',
            border: '1.5px solid #E2E0FF',
            boxShadow: '0 20px 60px rgba(108,71,255,0.25)'
          }}>
            <div style={{
              fontSize: '18px', fontWeight: '800',
              color: '#14123A', marginBottom: '6px'
            }}>Upload Receipt</div>
            <div style={{
              fontSize: '13px', color: '#8B8FAF',
              lineHeight: '1.6', marginBottom: '20px'
            }}>
              Upload a receipt or proof of completion for{' '}
              <strong>{selectedGig.title}</strong>. Make sure your name is visible on it.
            </div>

            <div style={{
              background: '#EEE9FF', border: '2px dashed #B8A5FF',
              borderRadius: '14px', padding: '32px',
              textAlign: 'center', marginBottom: '16px',
              cursor: 'pointer'
            }} onClick={() => document.getElementById('receipt-input').click()}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📎</div>
              <div style={{
                fontSize: '14px', fontWeight: '700',
                color: '#6C47FF', marginBottom: '4px'
              }}>
                {uploading ? 'Uploading...' : 'Click to upload receipt'}
              </div>
              <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                Photo, PDF, or screenshot accepted
              </div>
              <input
                id="receipt-input"
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={handleReceiptUpload}
              />
            </div>

            <div style={{
              background: '#EEE9FF', border: '1.5px solid #B8A5FF',
              borderRadius: '10px', padding: '12px',
              display: 'flex', gap: '8px', marginBottom: '20px'
            }}>
              <span style={{ fontSize: '14px', flexShrink: 0 }}>🔒</span>
              <div style={{ fontSize: '11px', color: '#6C47FF', lineHeight: '1.5' }}>
                Both parties must upload receipts to confirm the transaction. Your name must be visible.
              </div>
            </div>

            <button onClick={() => setShowReceiptModal(false)} style={{
              width: '100%', background: '#F5F4FF',
              border: '1.5px solid #E2E0FF', borderRadius: '12px',
              padding: '13px', fontSize: '13px', fontWeight: '600',
              color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
            }}>Cancel</button>
          </div>
        </div>
      )}

      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}
    </div>
  )
}