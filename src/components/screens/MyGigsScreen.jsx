// import { useState, useEffect } from 'react'
// import { supabase } from '../../supabase'
// import { useAuth } from '../../context/AuthContext'
// import { getCurrency } from '../../data/currencies'
// import EditGig from '../EditGig'

// const getCurrencySymbol = (code) => getCurrency(code || 'USD').symbol
// import PublicProfile from '../PublicProfile'
// import ReviewModal from '../ReviewModal'
// import ReceiptFlow from '../ReceiptFlow'
// import BrandIcon from '../BrandIcon'
// import LiveTracking from '../LiveTracking'
// import { playAccepted, playDeclined } from '../../utils/sounds'
// import { sendPushToUser } from '../../utils/pushNotifications'
// import { useCredits } from '../../context/CreditsContext'

// const STATUS_CONFIG = {
//   open: { label: 'Open', color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
//   in_progress: { label: 'In Progress', color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
//   completed: { label: 'Completed', color: '#8B8FAF', bg: '#F5F4FF', border: '#E2E0FF' },
//   cancelled: { label: 'Cancelled', color: '#FF3366', bg: '#FFE8EE', border: '#FF99B3' },
// }

// const StatusBadge = ({ status }) => {
//   const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open
//   return (
//     <span style={{
//       background: cfg.bg, border: `1px solid ${cfg.border}`,
//       borderRadius: '5px', padding: '2px 8px',
//       fontSize: '9px', fontWeight: '700',
//       color: cfg.color, letterSpacing: '0.8px'
//     }}>{cfg.label}</span>
//   )
// }

// // ── APPLICANT ROW ── completely standalone, no parent click interference
// const ApplicantRow = ({ app, gig, onAccept, onDecline, onReview, onReceipt, onViewProfile }) => (
//   <div style={{
//     display: 'flex', alignItems: 'center',
//     justifyContent: 'space-between',
//     padding: '12px 0',
//     borderBottom: '1px solid #F0EEFF'
//   }}>
//     {/* Left */}
//     <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//       <div
//         role="button"
//         tabIndex={0}
//         onMouseDown={(e) => {
//           e.stopPropagation()
//           e.preventDefault()
//           onViewProfile(app.worker_id)
//         }}
//         style={{
//           width: '44px', height: '44px',
//           borderRadius: '12px', overflow: 'hidden',
//           border: '2px solid #B8A5FF',
//           cursor: 'pointer', flexShrink: 0,
//           background: '#EEE9FF',
//           display: 'flex', alignItems: 'center',
//           justifyContent: 'center',
//           fontSize: '16px', fontWeight: '800', color: '#6C47FF'
//         }}>
//         {app.users?.avatar_url
//           ? <img src={app.users.avatar_url} alt=""
//               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//           : app.users?.full_name?.charAt(0) || '?'
//         }
//       </div>
//       <div>
//         <div
//           role="button"
//           tabIndex={0}
//           onMouseDown={(e) => {
//             e.stopPropagation()
//             e.preventDefault()
//             onViewProfile(app.worker_id)
//           }}
//           style={{
//             fontSize: '13px', fontWeight: '700',
//             color: '#6C47FF', cursor: 'pointer',
//             marginBottom: '3px'
//           }}>
//           {app.users?.full_name || 'Unknown'} →
//         </div>
//         <div style={{ fontSize: '10px', color: '#A09DC8' }}>
//           Trust: {app.users?.trust_score || 100}% ·{' '}
//           <span style={{
//             fontWeight: '700',
//             color: app.status === 'accepted' ? '#00C48C'
//               : app.status === 'rejected' ? '#FF3366' : '#FF6B2B',
//             textTransform: 'capitalize'
//           }}>
//             {app.status}
//           </span>
//         </div>
//       </div>
//     </div>

//     {/* Right — actions */}
//     <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
//       {app.status === 'pending' && (
//         <>
//           <button
//             onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
//             onClick={() => onAccept(app)}
//             style={{
//               background: '#DFFDF4', border: '1.5px solid #7EECD2',
//               borderRadius: '8px', padding: '8px 12px',
//               fontSize: '12px', fontWeight: '700',
//               color: '#00C48C', cursor: 'pointer', fontFamily: 'inherit'
//             }}>✓ Accept</button>
//           <button
//             onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
//             onClick={() => onDecline(app)}
//             style={{
//               background: '#FFE8EE', border: '1.5px solid #FF99B3',
//               borderRadius: '8px', padding: '8px 12px',
//               fontSize: '12px', fontWeight: '700',
//               color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
//             }}>✗ Decline</button>
//         </>
//       )}
//       {app.status === 'accepted' && (
//         <>
//           <span style={{
//             background: '#DFFDF4', border: '1.5px solid #7EECD2',
//             borderRadius: '8px', padding: '7px 12px',
//             fontSize: '11px', fontWeight: '700', color: '#00C48C'
//           }}>✓ Accepted</span>
//           <button
//             onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
//             onClick={() => onReceipt(app)}
//             style={{
//               background: '#F5F4FF', border: '1.5px solid #E2E0FF',
//               borderRadius: '8px', padding: '7px 10px',
//               fontSize: '11px', fontWeight: '700',
//               color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
//             }}>📎</button>
//           <button
//             onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
//             onClick={() => onReview(app)}
//             style={{
//               background: '#EEE9FF', border: '1.5px solid #B8A5FF',
//               borderRadius: '8px', padding: '7px 10px',
//               fontSize: '11px', fontWeight: '700',
//               color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
//             }}>⭐</button>
//         </>
//       )}
//       {app.status === 'rejected' && (
//         <span style={{
//           background: '#FFE8EE', border: '1.5px solid #FF99B3',
//           borderRadius: '8px', padding: '7px 12px',
//           fontSize: '11px', fontWeight: '700', color: '#FF3366'
//         }}>✗ Declined</span>
//       )}
//     </div>
//   </div>
// )

// export default function MyGigsScreen() {
//   const { user } = useAuth()
//   const { hasUnpaidCommissions, totalOwed, pendingCommissions } = useCredits()
//   const [tab, setTab] = useState('posted')
//   const [postedGigs, setPostedGigs] = useState([])
//   const [appliedGigs, setAppliedGigs] = useState([])
//   const [loading, setLoading] = useState(true)
//   const [expandedGigId, setExpandedGigId] = useState(null)
//   const [selectedGig, setSelectedGig] = useState(null)
//   const [showReceiptFlow, setShowReceiptFlow] = useState(false)
//   const [receiptUserRole, setReceiptUserRole] = useState('poster')
//   const [receiptWorker, setReceiptWorker] = useState(null)
//   const [uploading, setUploading] = useState(false)
//   const [viewingProfile, setViewingProfile] = useState(null)
//   const [showReview, setShowReview] = useState(false)
//   const [reviewData, setReviewData] = useState(null)
//   const [showTracking, setShowTracking] = useState(false)
//   const [trackingGig, setTrackingGig] = useState(null)
//   const [trackingRole, setTrackingRole] = useState('worker')
//   const [trackingWorker, setTrackingWorker] = useState(null)
//   const [editingGig, setEditingGig] = useState(null)

//   useEffect(() => {
//     fetchPostedGigs()
//     fetchAppliedGigs()
//   }, [user])

//   const fetchPostedGigs = async () => {
//     if (!user) return
//     const { data } = await supabase
//       .from('gigs')
//       .select(`
//         *,
//         applications (
//           id, status, worker_id,
//           users ( id, full_name, avatar_url, trust_score, rating, gigs_completed, bio, skills, location )
//         )
//       `)
//       .eq('poster_id', user.id)
//       .order('created_at', { ascending: false })
//     if (data) setPostedGigs(data)
//     setLoading(false)
//   }

//   const fetchAppliedGigs = async () => {
//     if (!user) return
//     const { data } = await supabase
//       .from('applications')
//       .select('*, gigs(*, users(id, full_name, avatar_url, trust_score))')
//       .eq('worker_id', user.id)
//       .order('created_at', { ascending: false })
//     if (data) setAppliedGigs(data)
//   }

//   const handleAccept = async (app, gig) => {
//     playAccepted()
//     await supabase
//       .from('applications')
//       .update({ status: 'accepted' })
//       .eq('id', app.id)

//     const { data: accepted } = await supabase
//       .from('applications')
//       .select('id')
//       .eq('gig_id', gig.id)
//       .eq('status', 'accepted')

//     const filled = accepted?.length || 0

//     if (filled >= gig.slots) {
//       await supabase
//         .from('gigs')
//         .update({ status: 'in_progress', slots_filled: filled })
//         .eq('id', gig.id)
//     } else {
//       await supabase
//         .from('gigs')
//         .update({ slots_filled: filled })
//         .eq('id', gig.id)
//     }

//     await supabase.from('notifications').insert({
//       user_id: app.worker_id,
//       title: 'Application Accepted! 🎉',
//       message: `Your application for "${gig.title}" was accepted`,
//       type: 'accepted',
//       gig_id: gig.id
//     })
//     await sendPushToUser(
//       app.worker_id,
//       '🎉 Application Accepted!',
//       `Your application for "${gig.title}" was accepted`,
//       { type: 'accepted', gigId: gig.id }
//     )

//     fetchPostedGigs()
//   }

//   const handleDecline = async (app, gig) => {
//     playDeclined()
//     await supabase
//       .from('applications')
//       .update({ status: 'rejected' })
//       .eq('id', app.id)

//     await supabase.from('notifications').insert({
//       user_id: app.worker_id,
//       title: 'Application Update',
//       message: `Your application for "${gig.title}" was not selected`,
//       type: 'rejected',
//       gig_id: gig.id
//     })
//     await sendPushToUser(
//       app.worker_id,
//       'Application Update',
//       `Your application for "${gig.title}" was not selected`,
//       { type: 'rejected', gigId: gig.id }
//     )

//     fetchPostedGigs()
//   }

//   const handleDeleteGig = async (gigId) => {
//     if (!window.confirm('Delete this gig?')) return
//     await supabase.from('gigs').delete().eq('id', gigId)
//     fetchPostedGigs()
//   }

//   const handleReceiptUpload = async (e) => {
//     const file = e.target.files[0]
//     if (!file || !selectedGig) return
//     setUploading(true)
//     const fileName = `${user.id}-${selectedGig.id}-${Date.now()}.${file.name.split('.').pop()}`
//     const { error } = await supabase.storage
//       .from('receipts')
//       .upload(fileName, file, { upsert: true })
//     if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
//     const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName)
//     await supabase.from('receipts').upsert({
//       gig_id: selectedGig.id,
//       poster_id: selectedGig.poster_id,
//       worker_id: user.id,
//       worker_receipt_url: urlData.publicUrl,
//       worker_confirmed: true,
//     })
//     setUploading(false)
//     setShowReceiptModal(false)
//     alert('Receipt uploaded!')
//   }

//   return (
//     <div style={{
//       padding: '24px 20px 100px',
//       fontFamily: "'Plus Jakarta Sans', sans-serif"
//     }}>

//       <div style={{ marginBottom: '20px' }}>
//         <div style={{ fontSize: '22px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
//           My Gigs
//         </div>
//         <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
//           Track your posted and applied gigs
//         </div>
//       </div>

//       {/* Commission Warning */}
//       {hasUnpaidCommissions && (
//         <div
//           onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))}
//           style={{
//             background: '#FFE8EE', border: '1.5px solid #FF99B3',
//             borderRadius: '14px', padding: '12px 16px',
//             marginBottom: '16px', cursor: 'pointer',
//             display: 'flex', justifyContent: 'space-between',
//             alignItems: 'center', gap: '10px'
//           }}>
//           <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//             <span style={{ fontSize: '18px' }}>⚠️</span>
//             <div>
//               <div style={{ fontSize: '12px', fontWeight: '700', color: '#FF3366' }}>
//                 Platform commission due
//               </div>
//               <div style={{ fontSize: '10px', color: '#FF3366', opacity: 0.8 }}>
//                 ${totalOwed.toFixed(2)} owed · {pendingCommissions.length} pending
//               </div>
//             </div>
//           </div>
//           <div style={{
//             background: '#FF3366', color: '#fff',
//             borderRadius: '8px', padding: '5px 10px',
//             fontSize: '11px', fontWeight: '700', flexShrink: 0
//           }}>Pay Now →</div>
//         </div>
//       )}

//       {/* Tabs */}
//       <div style={{
//         display: 'flex', gap: '4px',
//         background: '#fff', borderRadius: '14px',
//         padding: '4px', border: '1.5px solid #E2E0FF',
//         marginBottom: '20px'
//       }}>
//         {[
//           { key: 'posted', label: `Posted (${postedGigs.length})` },
//           { key: 'applied', label: `Applied (${appliedGigs.length})` },
//         ].map(t => (
//           <button key={t.key} onClick={() => setTab(t.key)} style={{
//             flex: 1,
//             background: tab === t.key ? '#6C47FF' : 'transparent',
//             border: 'none', borderRadius: '10px',
//             padding: '10px 4px', fontSize: '13px',
//             fontWeight: tab === t.key ? '700' : '500',
//             color: tab === t.key ? '#fff' : '#8B8FAF',
//             cursor: 'pointer', fontFamily: 'inherit',
//             transition: 'all 0.2s'
//           }}>{t.label}</button>
//         ))}
//       </div>

//       {loading ? (
//         <div style={{ textAlign: 'center', padding: '48px', color: '#A09DC8' }}>
//           Loading...
//         </div>
//       ) : (
//         <>
//           {/* ── POSTED GIGS ── */}
//           {tab === 'posted' && (
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//               {postedGigs.length === 0 ? (
//                 <div style={{
//                   textAlign: 'center', padding: '48px',
//                   background: '#fff', borderRadius: '16px',
//                   border: '1.5px solid #E2E0FF'
//                 }}>
//                   <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
//                     <BrandIcon name="mygigs" size={46} />
//                   </div>
//                   <div style={{ fontSize: '15px', fontWeight: '700', color: '#14123A' }}>
//                     No gigs posted yet
//                   </div>
//                 </div>
//               ) : postedGigs.map(gig => (
//                 <div key={gig.id} style={{
//                   background: '#fff',
//                   border: '1.5px solid #E2E0FF',
//                   borderRadius: '16px', overflow: 'hidden'
//                 }}>

//                   {/* Header — click to expand */}
//                   <div
//                     onClick={() => setExpandedGigId(
//                       expandedGigId === gig.id ? null : gig.id
//                     )}
//                     style={{
//                       padding: '16px 18px', cursor: 'pointer',
//                       display: 'flex', justifyContent: 'space-between',
//                       alignItems: 'flex-start',
//                       background: expandedGigId === gig.id ? '#F8F7FF' : '#fff',
//                       userSelect: 'none'
//                     }}>
//                     <div style={{ flex: 1 }}>
//                       <div style={{
//                         fontSize: '15px', fontWeight: '700',
//                         color: '#14123A', marginBottom: '7px'
//                       }}>{gig.title}</div>
//                       <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
//                         <StatusBadge status={gig.status} />
//                         <span style={{
//                           background: '#F5F4FF', border: '1px solid #E2E0FF',
//                           borderRadius: '5px', padding: '2px 8px',
//                           fontSize: '9px', fontWeight: '600', color: '#8B8FAF'
//                         }}>
//                           {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
//                         </span>
//                         {gig.slots > 1 && (
//                           <span style={{
//                             background: '#DFFDF4', border: '1px solid #7EECD2',
//                             borderRadius: '5px', padding: '2px 8px',
//                             fontSize: '9px', fontWeight: '700', color: '#00C48C'
//                           }}>
//                             {gig.slots_filled || 0}/{gig.slots} slots
//                           </span>
//                         )}
//                       </div>
//                     </div>
//                     <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '10px' }}>
//                       <div style={{
//                         fontSize: '15px', fontWeight: '800', color: '#00C48C'
//                       }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
//                       <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '2px' }}>
//                         {new Date(gig.created_at).toLocaleDateString()}
//                         {gig.expires_at && (
//                           <span style={{
//                             marginLeft: '6px',
//                             color: new Date(gig.expires_at) < new Date(Date.now() + 86400000)
//                               ? '#FF3366' : '#A09DC8'
//                           }}>
//                             · Expires {new Date(gig.expires_at).toLocaleDateString('en-US', {
//                               month: 'short', day: 'numeric'
//                             })}
//                           </span>
//                         )}
//                       </div>
//                       <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '4px' }}>
//                         {expandedGigId === gig.id ? '▲' : '▼'}
//                       </div>
//                     </div>
//                   </div>

//                   {/* Expanded detail */}
//                   {expandedGigId === gig.id && (
//                     <div style={{
//                       borderTop: '1px solid #E2E0FF',
//                       padding: '14px 18px', background: '#F8F7FF'
//                     }}>
//                       <div style={{
//                         display: 'grid', gridTemplateColumns: '1fr 1fr',
//                         gap: '10px', marginBottom: '10px'
//                       }}>
//                         <div style={{
//                           background: '#fff', borderRadius: '10px', padding: '10px'
//                         }}>
//                           <div style={{
//                             fontSize: '9px', color: '#A09DC8', fontWeight: '700',
//                             textTransform: 'uppercase', letterSpacing: '0.5px',
//                             marginBottom: '3px'
//                           }}>Pay Range</div>
//                           <div style={{
//                             fontSize: '15px', fontWeight: '800', color: '#00C48C'
//                           }}>{getCurrencySymbol(gig.currency)}{gig.pay_min}–{getCurrencySymbol(gig.currency)}{gig.pay_max}</div>
//                         </div>
//                         <div style={{
//                           background: '#fff', borderRadius: '10px', padding: '10px'
//                         }}>
//                           <div style={{
//                             fontSize: '9px', color: '#A09DC8', fontWeight: '700',
//                             textTransform: 'uppercase', letterSpacing: '0.5px',
//                             marginBottom: '3px'
//                           }}>Field</div>
//                           <div style={{
//                             fontSize: '13px', fontWeight: '700', color: '#14123A'
//                           }}>{gig.field || '—'}</div>
//                         </div>
//                       </div>
//                       {gig.location && (
//                         <div style={{
//                           background: '#fff', borderRadius: '10px',
//                           padding: '10px', marginBottom: '8px'
//                         }}>
//                           <div style={{
//                             fontSize: '9px', color: '#A09DC8', fontWeight: '700',
//                             textTransform: 'uppercase', letterSpacing: '0.5px',
//                             marginBottom: '4px'
//                           }}>Location</div>
//                           <div style={{
//                             fontSize: '13px', fontWeight: '600', color: '#14123A'
//                           }}>📍 {gig.location}</div>
//                         </div>
//                       )}
//                       {gig.description && (
//                         <div style={{
//                           background: '#fff', borderRadius: '10px', padding: '10px'
//                         }}>
//                           <div style={{
//                             fontSize: '9px', color: '#A09DC8', fontWeight: '700',
//                             textTransform: 'uppercase', letterSpacing: '0.5px',
//                             marginBottom: '4px'
//                           }}>Description</div>
//                           <div style={{
//                             fontSize: '12px', color: '#5B5887', lineHeight: '1.6'
//                           }}>{gig.description}</div>
//                         </div>
//                       )}
//                     </div>
//                   )}

//                   {/* Applicants — rendered as separate component, no parent click */}
//                   {gig.applications && gig.applications.length > 0 && (
//                     <div style={{
//                       borderTop: '1px solid #E2E0FF',
//                       padding: '12px 18px'
//                     }}>
//                       <div style={{
//                         fontSize: '10px', fontWeight: '700', color: '#6C47FF',
//                         textTransform: 'uppercase', letterSpacing: '0.8px',
//                         marginBottom: '4px'
//                       }}>
//                         {gig.applications.length} Applicant{gig.applications.length !== 1 ? 's' : ''}
//                       </div>
//                       {gig.applications.map((app) => (
//                         <div key={app.id}>
//                           <ApplicantRow
//                             app={app}
//                             gig={gig}
//                             onAccept={(a) => handleAccept(a, gig)}
//                             onDecline={(a) => handleDecline(a, gig)}
//                             onReceipt={(a) => {
//                               setSelectedGig(gig)
//                               setReceiptWorker({ id: a.worker_id, name: a.users?.full_name || 'Worker' })
//                               setReceiptUserRole('poster')
//                               setShowReceiptFlow(true)
//                             }}
//                             onReview={(a) => {
//                               setReviewData({
//                                 gig,
//                                 revieweeId: a.worker_id,
//                                 revieweeName: a.users?.full_name || 'Worker',
//                                 reviewType: 'worker'
//                               })
//                               setShowReview(true)
//                             }}
//                             onViewProfile={(id) => setViewingProfile(id)}
//                           />
//                           {app.status === 'accepted' && gig.type === 'physical' && (
//                             <button
//                               onClick={() => {
//                                 setTrackingGig(gig)
//                                 setTrackingRole('poster')
//                                 setTrackingWorker(app.users)
//                                 setShowTracking(true)
//                               }}
//                               style={{
//                                 marginTop: '8px', width: '100%',
//                                 background: '#EEE9FF', border: '1.5px solid #B8A5FF',
//                                 borderRadius: '10px', padding: '9px',
//                                 fontSize: '12px', fontWeight: '700', color: '#6C47FF',
//                                 cursor: 'pointer', fontFamily: 'inherit',
//                                 display: 'flex', alignItems: 'center',
//                                 justifyContent: 'center', gap: '6px'
//                               }}>
//                               📍 Track Worker
//                             </button>
//                           )}
//                         </div>
//                       ))}
//                     </div>
//                   )}

//                   {/* Bottom actions */}
//                   <div style={{
//                     borderTop: '1px solid #E2E0FF',
//                     padding: '12px 18px',
//                     display: 'flex', gap: '8px', justifyContent: 'flex-end'
//                   }}>
//                     <button
//                       onClick={() => setEditingGig(gig)}
//                       style={{
//                         background: '#EEE9FF', border: '1.5px solid #B8A5FF',
//                         borderRadius: '10px', padding: '10px 14px',
//                         fontSize: '13px', fontWeight: '700',
//                         color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
//                       }}>✏️ Edit</button>
//                     <button
//                       onClick={() => handleDeleteGig(gig.id)}
//                       style={{
//                         background: '#FFE8EE', border: '1.5px solid #FF99B3',
//                         borderRadius: '10px', padding: '10px 14px',
//                         fontSize: '13px', fontWeight: '700',
//                         color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
//                       }}>🗑 Delete</button>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}

//           {/* ── APPLIED GIGS ── */}
//           {tab === 'applied' && (
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//               {appliedGigs.length === 0 ? (
//                 <div style={{
//                   textAlign: 'center', padding: '48px',
//                   background: '#fff', borderRadius: '16px',
//                   border: '1.5px solid #E2E0FF'
//                 }}>
//                   <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
//                     <BrandIcon name="feed" size={46} />
//                   </div>
//                   <div style={{
//                     fontSize: '15px', fontWeight: '700',
//                     color: '#14123A', marginBottom: '6px'
//                   }}>No applications yet</div>
//                   <div style={{ fontSize: '13px', color: '#A09DC8' }}>
//                     Browse the Feed and apply for gigs
//                   </div>
//                 </div>
//               ) : appliedGigs.map(app => (
//                 <div key={app.id} style={{
//                   background: '#fff', border: '1.5px solid #E2E0FF',
//                   borderRadius: '16px', padding: '18px'
//                 }}>
//                   <div style={{
//                     display: 'flex', justifyContent: 'space-between',
//                     alignItems: 'flex-start', marginBottom: '10px'
//                   }}>
//                     <div style={{ flex: 1 }}>
//                       <div style={{
//                         fontSize: '15px', fontWeight: '700',
//                         color: '#14123A', marginBottom: '6px'
//                       }}>{app.gigs?.title || 'Gig'}</div>
//                       <span style={{
//                         background: app.status === 'accepted' ? '#DFFDF4'
//                           : app.status === 'rejected' ? '#FFE8EE' : '#EEE9FF',
//                         border: `1px solid ${app.status === 'accepted' ? '#7EECD2'
//                           : app.status === 'rejected' ? '#FF99B3' : '#B8A5FF'}`,
//                         borderRadius: '5px', padding: '2px 8px',
//                         fontSize: '9px', fontWeight: '700',
//                         color: app.status === 'accepted' ? '#00C48C'
//                           : app.status === 'rejected' ? '#FF3366' : '#6C47FF',
//                         letterSpacing: '0.8px', textTransform: 'uppercase'
//                       }}>
//                         {app.status === 'accepted' ? '✓ Accepted'
//                           : app.status === 'rejected' ? '✗ Declined' : '⏳ Pending'}
//                       </span>
//                     </div>
//                     <div style={{
//                       fontSize: '15px', fontWeight: '800', color: '#00C48C'
//                     }}>
//                       {getCurrencySymbol(app.gigs?.currency)}{app.gigs?.pay_min}–{getCurrencySymbol(app.gigs?.currency)}{app.gigs?.pay_max}
//                     </div>
//                   </div>
//                   <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
//                     Posted by {app.gigs?.users?.full_name || 'Unknown'} ·{' '}
//                     Applied {new Date(app.created_at).toLocaleDateString()}
//                   </div>
//                   {app.status === 'accepted' && (
//                     <button
//                       onClick={() => {
//                         setSelectedGig(app.gigs)
//                         setReceiptUserRole('worker')
//                         setShowReceiptFlow(true)
//                       }}
//                       style={{
//                         marginTop: '12px', width: '100%',
//                         background: '#EEE9FF', border: '1.5px solid #B8A5FF',
//                         borderRadius: '10px', padding: '10px',
//                         fontSize: '12px', fontWeight: '700',
//                         color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit'
//                       }}>📎 Upload Completion Receipt</button>
//                   )}
//                   {app.status === 'accepted' && app.gigs?.type === 'physical' && (
//                     <button
//                       onClick={() => {
//                         setTrackingGig(app.gigs)
//                         setTrackingRole('worker')
//                         setTrackingWorker(null)
//                         setShowTracking(true)
//                       }}
//                       style={{
//                         marginTop: '10px', width: '100%',
//                         background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
//                         border: 'none', borderRadius: '12px', padding: '12px',
//                         fontSize: '13px', fontWeight: '700', color: '#fff',
//                         cursor: 'pointer', fontFamily: 'inherit',
//                         display: 'flex', alignItems: 'center',
//                         justifyContent: 'center', gap: '8px',
//                         boxShadow: '0 4px 16px rgba(108,71,255,0.35)'
//                       }}>
//                       🧭 Navigate to Gig
//                     </button>
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}
//         </>
//       )}

//       {/* Receipt Flow */}
//       {showReceiptFlow && selectedGig && (
//         <ReceiptFlow
//           gig={selectedGig}
//           userRole={receiptUserRole}
//           workerId={receiptUserRole === 'poster' ? receiptWorker?.id : user.id}
//           onClose={() => {
//             setShowReceiptFlow(false)
//             setSelectedGig(null)
//             setReceiptWorker(null)
//           }}
//           onComplete={() => {
//             setShowReceiptFlow(false)
//             setReceiptWorker(null)
//             fetchPostedGigs()
//             fetchAppliedGigs()
//           }}
//         />
//       )}

//       {/* Review Modal */}
//       {showReview && reviewData && (
//         <ReviewModal
//           gig={reviewData.gig}
//           revieweeId={reviewData.revieweeId}
//           revieweeName={reviewData.revieweeName}
//           reviewType={reviewData.reviewType}
//           onClose={() => setShowReview(false)}
//           onDone={() => { setShowReview(false); fetchPostedGigs() }}
//         />
//       )}

//       {/* Public Profile */}
//       {viewingProfile && (
//         <PublicProfile
//           userId={viewingProfile}
//           onClose={() => setViewingProfile(null)}
//         />
//       )}

//       {/* Live Tracking */}
//       {showTracking && trackingGig && (
//         <LiveTracking
//           gig={trackingGig}
//           role={trackingRole}
//           workerInfo={trackingWorker}
//           posterInfo={trackingRole === 'worker'
//             ? trackingGig.users
//             : null}
//           onClose={() => {
//             setShowTracking(false)
//             setTrackingGig(null)
//           }}
//         />
//       )}

//       {/* Edit Gig Modal */}
//       {editingGig && (
//         <EditGig
//           gig={editingGig}
//           onClose={() => setEditingGig(null)}
//           onSaved={() => {
//             setEditingGig(null)
//             fetchPostedGigs()
//           }}
//         />
//       )}
//     </div>
//   )
// }






























import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { useCredits } from '../../context/CreditsContext'
import { getCurrency } from '../../data/currencies'
import PublicProfile from '../PublicProfile'
import ReceiptFlow from '../ReceiptFlow'
import ReviewModal from '../ReviewModal'
import LiveTracking from '../LiveTracking'
import EditGig from '../EditGig'

// ─── CONSTANTS ───────────────────────────────────────
const TABS = [
  { key: 'posted', label: '📋 Posted' },
  { key: 'working', label: '⚡ Working' },
  { key: 'history', label: '📊 History' },
]

const POSTED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'action', label: '🔴 Needs Action' },
  { key: 'inprogress', label: 'In Progress' },
  { key: 'open', label: 'Open' },
  { key: 'completed', label: 'Done' },
]

const WORKING_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'action', label: '🔴 Needs Action' },
  { key: 'inprogress', label: 'In Progress' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Done' },
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

  const [tab, setTab] = useState('posted')
  const [postedFilter, setPostedFilter] = useState('all')
  const [workingFilter, setWorkingFilter] = useState('all')
  const [historyFilter, setHistoryFilter] = useState('all')

  const [postedGigs, setPostedGigs] = useState([])
  const [workingGigs, setWorkingGigs] = useState([])
  const [historyGigs, setHistoryGigs] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showActions, setShowActions] = useState(false)

  // Modals
  const [receiptGig, setReceiptGig] = useState(null)
  const [reviewGig, setReviewGig] = useState(null)
  const [trackingGig, setTrackingGig] = useState(null)
  const [editingGig, setEditingGig] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [applicantsGig, setApplicantsGig] = useState(null)

  useEffect(() => {
    if (user) {
      fetchAll()
      subscribeToUpdates()
    }
  }, [user])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([
      fetchPostedGigs(),
      fetchWorkingGigs(),
      fetchActions(),
    ])
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
          id, status, worker_id,
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
        id, status, created_at, accepted_at,
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
      .order('created_at', { ascending: false })
    if (data) setWorkingGigs(data.filter(a => a.gigs))
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

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('gigs')
      .select(`
        *,
        receipts(amount, currency, commission_amount, completed),
        worker:users!gigs_worker_id_fkey(full_name, avatar_url),
        reviews(id, rating, reviewer_id)
      `)
      .or(`poster_id.eq.${user.id},worker_id.eq.${user.id}`)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
    if (data) setHistoryGigs(data)
  }

  // Fetch history when tab changes
  useEffect(() => {
    if (tab === 'history' && historyGigs.length === 0) {
      fetchHistory()
    }
  }, [tab])

  // ─── ACTIONS ───────────────────────────────────────

  const acceptApplication = async (gig, application) => {
    try {
      // Accept this application
      await supabase
        .from('applications')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', application.id)

      // Decline all others
      await supabase
        .from('applications')
        .update({ status: 'declined' })
        .eq('gig_id', gig.id)
        .neq('id', application.id)

      // Update gig with worker
      await supabase
        .from('gigs')
        .update({
          status: 'in_progress',
          worker_id: application.worker_id,
          worker_name: application.users?.full_name,
          accepted_at: new Date().toISOString()
        })
        .eq('id', gig.id)

      // Notify accepted worker
      await supabase.from('notifications').insert({
        user_id: application.worker_id,
        title: '🎉 You Got The Job!',
        message: `Your application for "${gig.title}" was accepted! Get in touch with the poster and get started.`,
        type: 'accepted',
        gig_id: gig.id
      })

      // Notify declined workers
      const declinedApps = gig.applications?.filter(
        a => a.id !== application.id
      ) || []
      if (declinedApps.length > 0) {
        await supabase.from('notifications').insert(
          declinedApps.map(a => ({
            user_id: a.worker_id,
            title: 'Application Update',
            message: `Your application for "${gig.title}" was not selected this time.`,
            type: 'declined',
            gig_id: gig.id
          }))
        )
      }

      await fetchAll()
    } catch (e) {
      alert('Error accepting: ' + e.message)
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
      type: 'declined',
      gig_id: application.gig_id
    })

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

  const filteredPostedGigs = postedGigs.filter(gig => {
    const status = getPostedGigStatus(gig)
    if (postedFilter === 'all') return true
    if (postedFilter === 'action') return ['hasapplicants', 'waiting'].includes(status)
    if (postedFilter === 'inprogress') return status === 'inprogress'
    if (postedFilter === 'open') return status === 'open'
    if (postedFilter === 'completed') return status === 'completed'
    return true
  })

  const filteredWorkingGigs = workingGigs.filter(app => {
    const status = getWorkingGigStatus(app)
    if (workingFilter === 'all') return true
    if (workingFilter === 'action') return status === 'confirmreceipt'
    if (workingFilter === 'inprogress') return status === 'inprogress'
    if (workingFilter === 'pending') return status === 'pending'
    if (workingFilter === 'completed') return status === 'completed'
    return true
  })

  // ─── ACTION COUNTS ─────────────────────────────────

  const postedActionCount = postedGigs.filter(g =>
    ['hasapplicants', 'waiting'].includes(getPostedGigStatus(g))
  ).length

  const workingActionCount = workingGigs.filter(a =>
    getWorkingGigStatus(a) === 'confirmreceipt'
  ).length + pendingCommissions.length

  const totalActionCount = postedActionCount + workingActionCount

  // ─── STYLES ────────────────────────────────────────

  const sectionHeader = (label, color = '#A09DC8') => (
    <div style={{
      fontSize: '10px', fontWeight: '800',
      color, textTransform: 'uppercase',
      letterSpacing: '1.2px', padding: '16px 0 8px',
      display: 'flex', alignItems: 'center', gap: '6px'
    }}>
      {label}
    </div>
  )

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
        background: '#fff', padding: '16px 20px 0',
        borderBottom: '1.5px solid #E2E0FF', flexShrink: 0
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '14px'
        }}>
          <div>
            <div style={{
              fontSize: '20px', fontWeight: '800', color: '#14123A'
            }}>My Gigs</div>
            <div style={{ fontSize: '12px', color: '#8B8FAF' }}>
              Manage your work
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(
              new CustomEvent('openPostGig')
            )}
            style={{
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', borderRadius: '12px',
              padding: '10px 16px', fontSize: '13px',
              fontWeight: '700', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 16px rgba(108,71,255,0.35)'
            }}>
            + Post Gig
          </button>
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
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                borderBottom: `2.5px solid ${tab === t.key ? '#6C47FF' : 'transparent'}`,
                padding: '10px 4px', fontSize: '12px',
                fontWeight: tab === t.key ? '700' : '500',
                color: tab === t.key ? '#6C47FF' : '#8B8FAF',
                cursor: 'pointer', fontFamily: 'inherit',
                position: 'relative', transition: 'all 0.15s'
              }}>
              {t.label}
              {/* Action badge on tabs */}
              {t.key === 'posted' && postedActionCount > 0 && (
                <span style={{
                  position: 'absolute', top: '6px', right: '8px',
                  background: '#FF3366', color: '#fff',
                  borderRadius: '50%', width: '16px', height: '16px',
                  fontSize: '9px', fontWeight: '800',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center'
                }}>{postedActionCount}</span>
              )}
              {t.key === 'working' && workingActionCount > 0 && (
                <span style={{
                  position: 'absolute', top: '6px', right: '8px',
                  background: '#FF3366', color: '#fff',
                  borderRadius: '50%', width: '16px', height: '16px',
                  fontSize: '9px', fontWeight: '800',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center'
                }}>{workingActionCount}</span>
              )}
            </button>
          ))}
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
            {/* ── POSTED TAB ── */}
            {tab === 'posted' && (
              <PostedTab
                gigs={filteredPostedGigs}
                allGigs={postedGigs}
                filter={postedFilter}
                setFilter={setPostedFilter}
                filters={POSTED_FILTERS}
                getStatus={getPostedGigStatus}
                onAccept={acceptApplication}
                onDecline={declineApplication}
                onDelete={deleteGig}
                onReceipt={setReceiptGig}
                onEdit={setEditingGig}
                onViewProfile={setViewingProfile}
                onViewApplicants={setApplicantsGig}
                onTrack={setTrackingGig}
                onRefresh={fetchAll}
                sectionHeader={sectionHeader}
                userId={user?.id}
              />
            )}

            {/* ── WORKING TAB ── */}
            {tab === 'working' && (
              <WorkingTab
                applications={filteredWorkingGigs}
                allApplications={workingGigs}
                filter={workingFilter}
                setFilter={setWorkingFilter}
                filters={WORKING_FILTERS}
                getStatus={getWorkingGigStatus}
                pendingCommissions={pendingCommissions}
                totalOwed={totalOwed}
                onReceipt={(gig) => setReceiptGig(gig)}
                onViewProfile={setViewingProfile}
                onTrack={setTrackingGig}
                onRefresh={fetchAll}
                sectionHeader={sectionHeader}
                userId={user?.id}
              />
            )}

            {/* ── HISTORY TAB ── */}
            {tab === 'history' && (
              <HistoryTab
                gigs={historyGigs}
                filter={historyFilter}
                setFilter={setHistoryFilter}
                onReview={setReviewGig}
                onViewProfile={setViewingProfile}
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

      {reviewGig && (
        <ReviewModal
          gig={reviewGig}
          onClose={() => setReviewGig(null)}
          onSubmit={() => {
            setReviewGig(null)
            fetchAll()
          }}
        />
      )}

      {trackingGig && (
        <LiveTracking
          gig={trackingGig}
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
  gigs, allGigs, filter, setFilter, filters,
  getStatus, onAccept, onDecline, onDelete,
  onReceipt, onEdit, onViewProfile, onViewApplicants,
  onTrack, onRefresh, sectionHeader, userId
}) {
  const actionGigs = gigs.filter(g =>
    ['hasapplicants', 'waiting'].includes(getStatus(g))
  )
  const inProgressGigs = gigs.filter(g => getStatus(g) === 'inprogress')
  const openGigs = gigs.filter(g => getStatus(g) === 'open')
  const completedGigs = gigs.filter(g => getStatus(g) === 'completed')

  if (allGigs.length === 0) {
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

  return (
    <div>
      {/* Filter chips */}
      <FilterChips
        filters={filters}
        active={filter}
        onChange={setFilter}
        counts={{
          action: allGigs.filter(g =>
            ['hasapplicants', 'waiting'].includes(getStatus(g))
          ).length
        }}
      />

      {filter === 'all' ? (
        <>
          {actionGigs.length > 0 && (
            <>
              {sectionHeader('🔴 Needs Action', '#FF3366')}
              {actionGigs.map(gig => (
                <PostedGigCard
                  key={gig.id} gig={gig}
                  status={getStatus(gig)}
                  onAccept={onAccept} onDecline={onDecline}
                  onDelete={onDelete} onReceipt={onReceipt}
                  onEdit={onEdit} onViewProfile={onViewProfile}
                  onViewApplicants={onViewApplicants}
                  onTrack={onTrack}
                />
              ))}
            </>
          )}
          {inProgressGigs.length > 0 && (
            <>
              {sectionHeader('🟡 In Progress', '#FF6B2B')}
              {inProgressGigs.map(gig => (
                <PostedGigCard
                  key={gig.id} gig={gig}
                  status={getStatus(gig)}
                  onAccept={onAccept} onDecline={onDecline}
                  onDelete={onDelete} onReceipt={onReceipt}
                  onEdit={onEdit} onViewProfile={onViewProfile}
                  onViewApplicants={onViewApplicants}
                  onTrack={onTrack}
                />
              ))}
            </>
          )}
          {openGigs.length > 0 && (
            <>
              {sectionHeader('🟢 Open', '#00C48C')}
              {openGigs.map(gig => (
                <PostedGigCard
                  key={gig.id} gig={gig}
                  status={getStatus(gig)}
                  onAccept={onAccept} onDecline={onDecline}
                  onDelete={onDelete} onReceipt={onReceipt}
                  onEdit={onEdit} onViewProfile={onViewProfile}
                  onViewApplicants={onViewApplicants}
                  onTrack={onTrack}
                />
              ))}
            </>
          )}
          {completedGigs.length > 0 && (
            <>
              {sectionHeader('✅ Completed', '#8B8FAF')}
              {completedGigs.map(gig => (
                <PostedGigCard
                  key={gig.id} gig={gig}
                  status={getStatus(gig)}
                  onAccept={onAccept} onDecline={onDecline}
                  onDelete={onDelete} onReceipt={onReceipt}
                  onEdit={onEdit} onViewProfile={onViewProfile}
                  onViewApplicants={onViewApplicants}
                  onTrack={onTrack}
                />
              ))}
            </>
          )}
        </>
      ) : (
        gigs.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px',
            color: '#A09DC8', fontSize: '13px'
          }}>Nothing here</div>
        ) : (
          gigs.map(gig => (
            <PostedGigCard
              key={gig.id} gig={gig}
              status={getStatus(gig)}
              onAccept={onAccept} onDecline={onDecline}
              onDelete={onDelete} onReceipt={onReceipt}
              onEdit={onEdit} onViewProfile={onViewProfile}
              onViewApplicants={onViewApplicants}
              onTrack={onTrack}
            />
          ))
        )
      )}
    </div>
  )
}

// ══════════════════════════════════════════
// POSTED GIG CARD
// ══════════════════════════════════════════
function PostedGigCard({
  gig, status, onAccept, onDecline, onDelete,
  onReceipt, onEdit, onViewProfile, onViewApplicants, onTrack
}) {
  const [expanded, setExpanded] = useState(false)
  const receipt = gig.receipts?.[0]
  const pendingApps = gig.applications?.filter(
    a => a.status === 'pending'
  ) || []
  const acceptedApp = gig.applications?.find(a => a.status === 'accepted')
  const currency = getCurrency(gig.currency || 'USD')
  const daysSinceAccepted = daysSince(gig.accepted_at)

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
      overflow: 'hidden', transition: 'all 0.2s'
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
              fontSize: '15px', fontWeight: '700', color: '#14123A'
            }}>{gig.title}</div>
            <div style={{
              fontSize: '11px', color: '#8B8FAF', marginTop: '3px'
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
        {(status === 'inprogress' || status === 'waiting') && gig.worker && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center',
            background: '#F5F4FF', borderRadius: '10px',
            padding: '8px 10px', marginTop: '6px'
          }}>
            <div
              onClick={(e) => {
                e.stopPropagation()
                onViewProfile(gig.worker_id)
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
              {gig.worker?.avatar_url ? (
                <img src={gig.worker.avatar_url} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : gig.worker?.full_name?.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '12px', fontWeight: '600', color: '#14123A'
              }}>{gig.worker?.full_name}</div>
              <div style={{ fontSize: '10px', color: '#8B8FAF' }}>
                ⭐ {gig.worker?.rating || 5.0} · Working since {timeAgo(gig.accepted_at)}
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
            {daysSinceAccepted >= 3 && (
              <div style={{
                background: '#FFF0E8', border: '1px solid #FFBC99',
                borderRadius: '8px', padding: '8px 12px',
                fontSize: '11px', color: '#FF6B2B',
                fontWeight: '600', marginBottom: '10px',
                display: 'flex', gap: '6px', alignItems: 'center'
              }}>
                <span>⚠️</span>
                <span>
                  {gig.worker?.full_name?.split(' ')[0]} has been working
                  {daysSinceAccepted} days. Have you paid them?
                </span>
              </div>
            )}
            <div style={{
              background: '#EEE9FF', border: '1.5px solid #B8A5FF',
              borderRadius: '12px', padding: '12px',
              marginBottom: '10px'
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
                  color: '#6C47FF', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>
                💬 Message
              </button>
              {gig.type === 'physical' && (
                <button
                  onClick={() => onTrack(gig)}
                  style={{
                    flex: 1, background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: '#FF6B2B', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>
                  📍 Track
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
              borderRadius: '12px', padding: '12px',
              marginBottom: '10px', textAlign: 'center'
            }}>
              <div style={{
                fontSize: '20px', marginBottom: '4px'
              }}>⏳</div>
              <div style={{
                fontSize: '12px', fontWeight: '700', color: '#6C47FF'
              }}>
                Waiting for {gig.worker?.full_name?.split(' ')[0]} to confirm
              </div>
              <div style={{
                fontSize: '11px', color: '#6C47FF',
                opacity: 0.8, marginTop: '2px'
              }}>
                You confirmed {getCurrency(receipt?.currency || 'USD').symbol}
                {receipt?.amount?.toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(
                'openChatWithUser',
                { detail: { userId: gig.worker_id, gigId: gig.id } }
              ))}
              style={{
                width: '100%', background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: '#6C47FF', cursor: 'pointer',
                fontFamily: 'inherit'
              }}>
              💬 Message {gig.worker?.full_name?.split(' ')[0]}
            </button>
          </div>
        )}

        {/* OPEN */}
        {status === 'open' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onEdit(gig)}
              style={{
                flex: 1, background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '10px', padding: '10px',
                fontSize: '12px', fontWeight: '700',
                color: '#8B8FAF', cursor: 'pointer',
                fontFamily: 'inherit'
              }}>✏️ Edit</button>
            <button
              onClick={() => onDelete(gig.id)}
              style={{
                background: '#FFE8EE',
                border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '14px', cursor: 'pointer',
                fontFamily: 'inherit'
              }}>🗑</button>
          </div>
        )}

        {/* COMPLETED */}
        {status === 'completed' && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center'
          }}>
            <div style={{
              flex: 1, fontSize: '12px', color: '#8B8FAF'
            }}>
              ✅ {getCurrency(receipt?.currency || 'USD').symbol}
              {receipt?.amount?.toLocaleString()} · Completed
            </div>
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
  applications, allApplications, filter, setFilter,
  filters, getStatus, pendingCommissions, totalOwed,
  onReceipt, onViewProfile, onTrack, onRefresh,
  sectionHeader, userId
}) {
  const actionApps = allApplications.filter(a =>
    getStatus(a) === 'confirmreceipt'
  )
  const inProgressApps = allApplications.filter(a =>
    getStatus(a) === 'inprogress'
  )
  const pendingApps = allApplications.filter(a =>
    getStatus(a) === 'pending'
  )
  const completedApps = allApplications.filter(a =>
    getStatus(a) === 'completed'
  )

  if (allApplications.length === 0) {
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

  const renderApps = (apps) => apps.map(app => (
    <WorkingGigCard
      key={app.id}
      application={app}
      status={getStatus(app)}
      commission={pendingCommissions.find(
        c => c.gig_id === app.gigs?.id
      )}
      onReceipt={onReceipt}
      onViewProfile={onViewProfile}
      onTrack={onTrack}
    />
  ))

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
              {pendingCommissions.length} pending ·
              Pay to maintain account
            </div>
          </div>
          <div style={{
            background: '#FF3366', color: '#fff',
            borderRadius: '8px', padding: '6px 12px',
            fontSize: '12px', fontWeight: '700'
          }}>Pay Now →</div>
        </div>
      )}

      {/* Filter chips */}
      <FilterChips
        filters={filters}
        active={filter}
        onChange={setFilter}
        counts={{
          action: actionApps.length
        }}
      />

      {filter === 'all' ? (
        <>
          {actionApps.length > 0 && (
            <>
              {sectionHeader('🔴 Action Required', '#FF3366')}
              {renderApps(actionApps)}
            </>
          )}
          {inProgressApps.length > 0 && (
            <>
              {sectionHeader('🟡 In Progress', '#FF6B2B')}
              {renderApps(inProgressApps)}
            </>
          )}
          {pendingApps.length > 0 && (
            <>
              {sectionHeader('🔵 Pending', '#6C47FF')}
              {renderApps(pendingApps)}
            </>
          )}
          {completedApps.length > 0 && (
            <>
              {sectionHeader('✅ Completed', '#8B8FAF')}
              {renderApps(completedApps)}
            </>
          )}
        </>
      ) : (
        applications.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px',
            color: '#A09DC8', fontSize: '13px'
          }}>Nothing here</div>
        ) : renderApps(applications)
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
      overflow: 'hidden'
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
          fontSize: '15px', fontWeight: '700',
          color: '#14123A', marginBottom: '4px'
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

        <div style={{ fontSize: '12px', color: '#00C48C', fontWeight: '700' }}>
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
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center'
          }}>
            <div style={{
              flex: 1, fontSize: '12px', color: '#8B8FAF'
            }}>
              ⏳ Waiting for poster to respond ·{' '}
              Applied {timeAgo(application.created_at)}
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(
                'openChatWithUser',
                { detail: { userId: gig?.poster_id, gigId: gig?.id } }
              ))}
              style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '8px', padding: '7px 12px',
                fontSize: '11px', fontWeight: '700',
                color: '#6C47FF', cursor: 'pointer',
                fontFamily: 'inherit'
              }}>💬</button>
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
              ⏳ Waiting for {poster?.full_name?.split(' ')[0]} to
              confirm payment after work is done
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
                  color: '#6C47FF', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>💬 Message</button>
              {gig?.type === 'physical' && (
                <button
                  onClick={() => onTrack(gig)}
                  style={{
                    flex: 1, background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '10px', padding: '10px',
                    fontSize: '12px', fontWeight: '700',
                    color: '#FF6B2B', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>📍 Directions</button>
              )}
            </div>
          </div>
        )}

        {/* CONFIRM RECEIPT */}
        {status === 'confirmreceipt' && (
          <div>
            <div style={{
              background: '#FFE8EE', border: '1.5px solid #FF99B3',
              borderRadius: '12px', padding: '12px',
              marginBottom: '10px'
            }}>
              <div style={{
                fontSize: '13px', fontWeight: '800',
                color: '#FF3366', marginBottom: '4px'
              }}>
                {poster?.full_name?.split(' ')[0]} confirmed payment
              </div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: '#FF3366', marginBottom: '4px'
              }}>
                {currency.symbol}{receipt?.amount?.toLocaleString()}{' '}
                <span style={{ fontSize: '14px' }}>
                  {receipt?.currency || 'USD'}
                </span>
              </div>
              <div style={{
                fontSize: '11px', color: '#FF3366', opacity: 0.8
              }}>
                Is this the amount you received?
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
                  color: '#FF3366', cursor: 'pointer',
                  fontFamily: 'inherit'
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
                }}>✓ Confirm Receipt →</button>
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
              <div style={{ fontSize: '12px', color: '#8B8FAF' }}>
                ✅ Earned {currency.symbol}
                {receipt?.amount?.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                {timeAgo(application.accepted_at)}
              </div>
            </div>

            {/* Commission status */}
            {commission && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 12px',
                marginBottom: '8px',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{
                    fontSize: '11px', fontWeight: '700',
                    color: '#FF3366', marginBottom: '1px'
                  }}>💰 Commission owed</div>
                  <div style={{
                    fontSize: '16px', fontWeight: '800', color: '#FF3366'
                  }}>
                    {getCurrency(commission.currency || 'USD').symbol}
                    {commission.commission_amount?.toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => window.dispatchEvent(
                    new CustomEvent('navigateTo', { detail: 'commission' })
                  )}
                  style={{
                    background: '#FF3366', color: '#fff',
                    border: 'none', borderRadius: '8px',
                    padding: '7px 12px', fontSize: '11px',
                    fontWeight: '700', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>Pay →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// HISTORY TAB
// ══════════════════════════════════════════
function HistoryTab({
  gigs, filter, setFilter, onReview, onViewProfile, userId
}) {
  const totalEarned = gigs
    .filter(g => g.worker_id === userId)
    .reduce((sum, g) => sum + (g.receipts?.[0]?.amount || 0), 0)

  const totalPosted = gigs
    .filter(g => g.poster_id === userId)
    .reduce((sum, g) => sum + (g.receipts?.[0]?.amount || 0), 0)

  const filteredGigs = gigs.filter(g => {
    if (filter === 'posted') return g.poster_id === userId
    if (filter === 'worked') return g.worker_id === userId
    return true
  })

  return (
    <div>
      {/* Summary Card */}
      <div style={{
        background: 'linear-gradient(135deg, #14123A, #1E1B4B)',
        borderRadius: '16px', padding: '18px',
        marginTop: '12px', marginBottom: '16px', color: '#fff'
      }}>
        <div style={{
          fontSize: '11px', opacity: 0.6,
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '12px'
        }}>All Time Summary</div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '12px'
        }}>
          {[
            { label: 'Total Earned', value: `$${totalEarned.toFixed(0)}`, icon: '💰' },
            { label: 'Total Spent', value: `$${totalPosted.toFixed(0)}`, icon: '📋' },
            { label: 'Gigs Worked', value: gigs.filter(g => g.worker_id === userId).length, icon: '⚡' },
            { label: 'Gigs Posted', value: gigs.filter(g => g.poster_id === userId).length, icon: '📌' },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '12px', padding: '12px'
            }}>
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{icon}</div>
              <div style={{
                fontSize: '18px', fontWeight: '800',
                marginBottom: '2px'
              }}>{value}</div>
              <div style={{
                fontSize: '10px', opacity: 0.6,
                textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '16px'
      }}>
        {[
          { key: 'all', label: '✦ All' },
          { key: 'worked', label: '⚡ Worked' },
          { key: 'posted', label: '📋 Posted' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? '#6C47FF' : '#fff',
              border: `1.5px solid ${filter === f.key ? '#6C47FF' : '#E2E0FF'}`,
              borderRadius: '20px', padding: '6px 14px',
              fontSize: '12px', fontWeight: '600',
              color: filter === f.key ? '#fff' : '#8B8FAF',
              cursor: 'pointer', fontFamily: 'inherit'
            }}>{f.label}</button>
        ))}
      </div>

      {filteredGigs.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No history yet"
          subtitle="Completed gigs will appear here"
        />
      ) : filteredGigs.map(gig => {
        const isWorker = gig.worker_id === userId
        const receipt = gig.receipts?.[0]
        const hasReview = gig.reviews?.some(r => r.reviewer_id === userId)
        const currency = getCurrency(receipt?.currency || gig.currency || 'USD')

        return (
          <div key={gig.id} style={{
            background: '#fff', border: '1.5px solid #E2E0FF',
            borderRadius: '14px', padding: '14px 16px',
            marginBottom: '10px'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: '8px'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '11px', color: isWorker ? '#6C47FF' : '#FF6B2B',
                  fontWeight: '700', marginBottom: '3px',
                  textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  {isWorker ? '⚡ Worked' : '📋 Posted'}
                </div>
                <div style={{
                  fontSize: '14px', fontWeight: '700',
                  color: '#14123A', marginBottom: '3px'
                }}>{gig.title}</div>
                <div style={{
                  fontSize: '11px', color: '#8B8FAF'
                }}>
                  {timeAgo(gig.accepted_at)}
                </div>
              </div>
              {receipt?.amount && (
                <div style={{
                  fontSize: '16px', fontWeight: '800',
                  color: isWorker ? '#00C48C' : '#14123A'
                }}>
                  {isWorker ? '+' : ''}{currency.symbol}
                  {receipt.amount.toLocaleString()}
                </div>
              )}
            </div>

            {!hasReview && (
              <button
                onClick={() => onReview(gig)}
                style={{
                  background: '#FFF8E0', border: '1.5px solid #FFD966',
                  borderRadius: '8px', padding: '7px 14px',
                  fontSize: '12px', fontWeight: '700',
                  color: '#FFB800', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>⭐ Leave Review</button>
            )}
          </div>
        )
      })}
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
                  onClick={() => onAccept(app)}
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
function FilterChips({ filters, active, onChange, counts = {} }) {
  return (
    <div style={{
      display: 'flex', gap: '6px',
      overflowX: 'auto', scrollbarWidth: 'none',
      padding: '12px 0', flexShrink: 0
    }}>
      {filters.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          style={{
            background: active === f.key ? '#6C47FF' : '#fff',
            border: `1.5px solid ${active === f.key ? '#6C47FF' : '#E2E0FF'}`,
            borderRadius: '20px', padding: '6px 14px',
            fontSize: '12px', fontWeight: '600',
            color: active === f.key ? '#fff' : '#8B8FAF',
            cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'inherit', flexShrink: 0,
            position: 'relative'
          }}>
          {f.label}
          {f.key === 'action' && counts.action > 0 && (
            <span style={{
              position: 'absolute', top: '-6px', right: '-6px',
              background: '#FF3366', color: '#fff',
              borderRadius: '50%', width: '16px', height: '16px',
              fontSize: '9px', fontWeight: '800',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center'
            }}>{counts.action}</span>
          )}
        </button>
      ))}
    </div>
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