import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { showToast } from '../utils/toast'
import { parseTimestamp } from '../utils/time'

const PACKAGE_COLORS = {
  basic: { color: 'var(--color-success)', bg: 'var(--color-success-soft)', border: 'var(--color-success-border)' },
  standard: { color: 'var(--color-brand)', bg: 'var(--color-brand-soft)', border: 'var(--color-brand-border-strong)' },
  premium: { color: 'var(--color-warning-gold)', bg: 'var(--color-warning-gold-soft)', border: 'var(--color-warning-gold-border)' },
}

export default function ServiceDetail({ service, onClose, onViewProfile, savedIds, toggleSave, onBoost, onReport }) {
  const { user } = useAuth()
  const [selectedPackage, setSelectedPackage] = useState('basic')
  const [ordering, setOrdering] = useState(false)
  const [ordered, setOrdered] = useState(false)

  // reviews
  const [reviews,      setReviews]      = useState([])
  const [myRating,     setMyRating]     = useState(0)
  const [myComment,    setMyComment]     = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [reviewsLoaded, setReviewsLoaded] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  useEffect(() => {
    fetchReviews()
  }, [service.id])

  const fetchReviews = async () => {
    const { data } = await supabase
      .from('service_reviews')
      .select('*, users(full_name, avatar_url, level)')
      .eq('service_id', service.id)
      .order('created_at', { ascending: false })
    if (data) setReviews(data)
    setReviewsLoaded(true)
    const mine = data?.find(r => r.reviewer_id === user?.id)
    if (mine) { setMyRating(mine.rating); setMyComment(mine.comment || '') }
  }

  const submitReview = async () => {
    if (!myRating) return showToast('Select a star rating', 'error')
    setSubmitting(true)
    const { error } = await supabase.rpc('submit_service_review', {
      p_service_id: service.id,
      p_rating:     myRating,
      p_comment:    myComment.trim() || null,
    })
    if (error) showToast(error.message, 'error')
    else { showToast('Review submitted!', 'success'); fetchReviews() }
    setSubmitting(false)
  }
  const [requirements, setRequirements] = useState('')
  const [currentImage, setCurrentImage] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  const packages = [
    service.basic_price && {
      key: 'basic',
      name: service.basic_name || 'Basic',
      desc: service.basic_desc,
      price: service.basic_price,
      delivery: service.basic_delivery,
    },
    service.standard_price && {
      key: 'standard',
      name: service.standard_name || 'Standard',
      desc: service.standard_desc,
      price: service.standard_price,
      delivery: service.standard_delivery,
    },
    service.premium_price && {
      key: 'premium',
      name: service.premium_name || 'Premium',
      desc: service.premium_desc,
      price: service.premium_price,
      delivery: service.premium_delivery,
    },
  ].filter(Boolean)

  const activePackage = packages.find(p => p.key === selectedPackage) || packages[0]
  const colors = PACKAGE_COLORS[activePackage?.key || 'basic']
  const isOwnService = service.worker_id === user?.id

  const handleOrder = async () => {
    if (!user) { showToast('Please log in to order', 'error'); return }
    if (isOwnService) { showToast("You can't order your own service", 'error'); return }
    setOrdering(true)

    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (activePackage.delivery || 1))

      await supabase.from('service_orders').insert({
        service_id: service.id,
        client_id: user.id,
        worker_id: service.worker_id,
        package: activePackage.key,
        price: activePackage.price,
        delivery_days: activePackage.delivery,
        requirements,
        status: 'pending',
        due_date: dueDate.toISOString()
      })

      // Notify worker
      await supabase.from('notifications').insert({
        user_id: service.worker_id,
        title: 'New Service Order! 🎉',
        message: `Someone ordered your "${service.title}" — ${activePackage.name} package`,
        type: 'application',
        gig_id: null
      })

      setOrdered(true)
    } catch (e) {
      showToast('Error placing order: ' + e.message, 'error')
    }
    setOrdering(false)
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
        background: 'var(--color-surface)',
        borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '640px',
        maxHeight: '92vh', overflowY: 'auto',
        position: 'relative',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        <button 
          onClick={onClose}
          aria-label="Close service details"
          style={{
            position: 'absolute', top: '12px', right: '14px',
            background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
            borderRadius: '50%', width: '36px', height: '36px',
            color: 'var(--color-text-muted)', fontSize: '20px',
            cursor: 'pointer', zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit', lineHeight: 1
          }}>
          ×
        </button>

        <div style={{
          width: '40px', height: '4px',
          background: 'var(--color-border)', borderRadius: '2px',
          margin: '12px auto 0'
        }} />

        <div style={{ padding: '20px' }}>
          {ordered ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: 'var(--color-brand)', marginBottom: '8px'
              }}>Order Placed!</div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-muted)',
                lineHeight: '1.6', marginBottom: '20px'
              }}>
                The worker has been notified. Open chat to share your requirements.
              </div>
              <button onClick={() => {
                window.dispatchEvent(new CustomEvent('openChatWithUser', { detail: { userId: service.worker_id } }))
                onClose()
              }} style={{
                background: 'var(--color-brand-gradient)',
                border: 'none', borderRadius: '12px',
                padding: '13px 32px', fontSize: '14px',
                fontWeight: '700', color: 'var(--color-surface)',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>Go to Chat →</button>
            </div>
          ) : (
            <>
              {/* Image Gallery */}
              {service.images && service.images.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  {/* Main image */}
                  <div style={{
                    position: 'relative', width: '100%',
                    paddingTop: '56.25%', borderRadius: '14px',
                    overflow: 'hidden', cursor: 'pointer',
                    background: 'var(--color-page)'
                  }} onClick={() => setLightbox(true)}>
                    <img
                      src={service.images[currentImage]}
                      alt=""
                      style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%', objectFit: 'cover',
                        animation: 'fadeInScale 0.25s ease'
                      }}
                    />
                    {/* Counter badge */}
                    <div style={{
                      position: 'absolute', bottom: '10px', right: '10px',
                      background: 'rgba(20,18,58,0.7)', backdropFilter: 'blur(4px)',
                      borderRadius: '8px', padding: '3px 9px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-surface)'
                    }}>
                      {currentImage + 1}/{service.images.length}
                    </div>
                    {/* Nav arrows */}
                    {service.images.length > 1 && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setCurrentImage(i => (i - 1 + service.images.length) % service.images.length) }}
                          style={{
                            position: 'absolute', left: '8px', top: '50%',
                            transform: 'translateY(-50%)', background: 'rgba(20,18,58,0.6)',
                            border: 'none', borderRadius: '50%', width: '32px', height: '32px',
                            color: 'var(--color-surface)', fontSize: '14px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>‹</button>
                        <button onClick={(e) => { e.stopPropagation(); setCurrentImage(i => (i + 1) % service.images.length) }}
                          style={{
                            position: 'absolute', right: '8px', top: '50%',
                            transform: 'translateY(-50%)', background: 'rgba(20,18,58,0.6)',
                            border: 'none', borderRadius: '50%', width: '32px', height: '32px',
                            color: 'var(--color-surface)', fontSize: '14px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>›</button>
                      </>
                    )}
                  </div>
                  {/* Thumbnail strip */}
                  {service.images.length > 1 && (
                    <div style={{
                      display: 'flex', gap: '6px', marginTop: '8px',
                      overflowX: 'auto', scrollbarWidth: 'none'
                    }}>
                      {service.images.map((img, i) => (
                        <div
                          key={i}
                          onClick={() => setCurrentImage(i)}
                          style={{
                            width: '52px', height: '52px', borderRadius: '8px',
                            overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
                            border: `2px solid ${currentImage === i ? 'var(--color-brand)' : 'var(--color-border)'}`,
                            opacity: currentImage === i ? 1 : 0.65,
                            transition: 'all 0.15s'
                          }}>
                          <img src={img} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Worker info */}
              <div style={{
                display: 'flex', gap: '12px',
                alignItems: 'center', marginBottom: '16px'
              }}>
                <div
                  onClick={() => onViewProfile(service.users?.id)}
                  style={{
                    width: '48px', height: '48px', borderRadius: '13px',
                    background: 'var(--color-brand-soft)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: '800', color: 'var(--color-brand)',
                    overflow: 'hidden', flexShrink: 0,
                    cursor: 'pointer', border: '2px solid var(--color-brand-border-strong)'
                  }}>
                  {service.users?.avatar_url ? (
                    <img src={service.users.avatar_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : service.users?.full_name?.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    onClick={() => onViewProfile(service.users?.id)}
                    style={{
                      fontSize: '14px', fontWeight: '700',
                      color: 'var(--color-brand)', cursor: 'pointer', marginBottom: '2px'
                    }}>
                    {service.users?.full_name || 'Unknown'} →
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    ⭐ {service.users?.rating || 5.0} ·{' '}
                    Trust {service.users?.trust_score || 100}%
                  </div>
                </div>
              </div>

              {/* Title + save */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)', lineHeight: '1.3', flex: 1, margin: 0 }}>
                  {service.title}
                </h2>
                {user && toggleSave && (
                  <button onClick={e => toggleSave(e, service.id)} style={{
                    fontSize: '22px', border: 'none', background: 'transparent',
                    cursor: 'pointer', flexShrink: 0, padding: '2px',
                  }}>{savedIds?.has(service.id) ? '❤️' : '🤍'}</button>
                )}
              </div>

              {user && !isOwnService && onReport && (
                <button type="button" onClick={() => onReport(service)} style={{
                  minHeight: '36px', padding: '0 10px', marginBottom: '10px', borderRadius: '10px',
                  border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-soft)',
                  color: 'var(--color-danger)', font: 'inherit', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                }}>Report this service</button>
              )}

              {/* Description */}
              {service.description && (
                <div style={{
                  fontSize: '13px', color: 'var(--color-text-muted)',
                  lineHeight: '1.7', marginBottom: '20px'
                }}>{service.description}</div>
              )}

              {/* Package Selector */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.8px',
                  marginBottom: '10px'
                }}>Choose Package</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {packages.map(pkg => {
                    const c = PACKAGE_COLORS[pkg.key]
                    const isActive = selectedPackage === pkg.key
                    return (
                      <button
                        key={pkg.key}
                        onClick={() => setSelectedPackage(pkg.key)}
                        style={{
                          flex: 1, background: isActive ? c.bg : 'var(--color-page)',
                          border: `1.5px solid ${isActive ? c.border : 'var(--color-border)'}`,
                          borderRadius: '12px', padding: '12px 8px',
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.15s', textAlign: 'center'
                        }}>
                        <div style={{
                          fontSize: '16px', fontWeight: '800',
                          color: isActive ? c.color : 'var(--color-text)', marginBottom: '2px'
                        }}>${pkg.price}</div>
                        <div style={{
                          fontSize: '12px', fontWeight: '700',
                          color: isActive ? c.color : 'var(--color-text-muted)'
                        }}>{pkg.name}</div>
                        <div style={{
                          fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '2px'
                        }}>{pkg.delivery}d delivery</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Active package details */}
              {activePackage && (
                <div style={{
                  background: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  borderRadius: '14px', padding: '16px',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '8px'
                  }}>
                    <div style={{
                      fontSize: '14px', fontWeight: '700', color: colors.color
                    }}>{activePackage.name}</div>
                    <div style={{
                      fontSize: '22px', fontWeight: '800', color: colors.color
                    }}>${activePackage.price}</div>
                  </div>
                  {activePackage.desc && (
                    <div style={{
                      fontSize: '12px', color: 'var(--color-text-muted)',
                      lineHeight: '1.6', marginBottom: '8px'
                    }}>{activePackage.desc}</div>
                  )}
                  <div style={{
                    display: 'flex', gap: '12px',
                    fontSize: '12px', color: 'var(--color-text-muted)'
                  }}>
                    <span>🕐 {activePackage.delivery} day{activePackage.delivery !== 1 ? 's' : ''} delivery</span>
                  </div>
                </div>
              )}

              {/* Requirements */}
              {!isOwnService && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    display: 'block', marginBottom: '7px'
                  }}>Share Requirements (optional)</label>
                  <textarea
                    value={requirements}
                    onChange={e => setRequirements(e.target.value)}
                    placeholder="Describe what you need, share any references, links or details..."
                    style={{
                      width: '100%', background: 'var(--color-page)',
                      border: '1.5px solid var(--color-border)', borderRadius: '10px',
                      padding: '12px 14px', fontSize: '13px',
                      color: 'var(--color-text)', fontFamily: 'inherit',
                      outline: 'none', resize: 'vertical',
                      minHeight: '80px', boxSizing: 'border-box'
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--color-brand-border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
              )}

              {/* Reviews section */}
              <div style={{ marginTop: '24px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text)' }}>
                    Reviews {service.review_count > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: '500' }}>({service.review_count})</span>}
                  </div>
                  {service.avg_rating > 0 && (
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-warning-gold)' }}>
                      ⭐ {Number(service.avg_rating).toFixed(1)}
                    </div>
                  )}
                </div>

                {/* Write a review (non-owner only) */}
                {user && !isOwnService && (
                  <div style={{ background: 'var(--color-surface-tint)', border: '1.5px solid var(--color-border)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                      {reviews.find(r => r.reviewer_id === user.id) ? 'Update your review' : 'Leave a review'}
                    </div>
                    {/* Star picker */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      {[1,2,3,4,5].map(star => (
                        <button key={star} onClick={() => setMyRating(star)} style={{
                          fontSize: '22px', border: 'none', background: 'transparent',
                          cursor: 'pointer', opacity: star <= myRating ? 1 : 0.3,
                          transition: 'opacity 0.1s',
                        }}>⭐</button>
                      ))}
                    </div>
                    <textarea
                      value={myComment}
                      onChange={e => setMyComment(e.target.value)}
                      placeholder="Share your experience (optional)..."
                      rows={2}
                      style={{
                        width: '100%', background: 'var(--color-surface)',
                        border: '1.5px solid var(--color-border)', borderRadius: '10px',
                        padding: '10px 12px', fontSize: '12px',
                        color: 'var(--color-text)', fontFamily: 'inherit',
                        outline: 'none', resize: 'none',
                        boxSizing: 'border-box', marginBottom: '10px',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--color-brand-border-strong)'}
                      onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                    />
                    <button onClick={submitReview} disabled={submitting || !myRating} style={{
                      background: (!myRating || submitting) ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
                      border: 'none', borderRadius: '10px', padding: '10px 20px',
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-surface)',
                      cursor: (!myRating || submitting) ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}>{submitting ? 'Submitting...' : 'Submit Review'}</button>
                  </div>
                )}

                {/* Reviews list */}
                {reviewsLoaded && reviews.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)', textAlign: 'center', padding: '16px 0' }}>
                    No reviews yet. Be the first!
                  </div>
                ) : (
                  reviews.map(rev => (
                    <div key={rev.id} style={{ borderBottom: '1px solid var(--color-page)', paddingBottom: '12px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '8px',
                          background: 'var(--color-brand-soft)', overflow: 'hidden', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: '800', color: 'var(--color-brand)',
                        }}>
                          {rev.users?.avatar_url
                            ? <img src={rev.users.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : rev.users?.full_name?.charAt(0) || '?'
                          }
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text)' }}>
                            {rev.users?.full_name || 'Anonymous'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-warning-gold)' }}>{'⭐'.repeat(rev.rating)}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                          {parseTimestamp(rev.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      {rev.comment && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6', paddingLeft: '36px' }}>
                          {rev.comment}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Action Buttons */}
              {isOwnService ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{
                    flex: 1, background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                    borderRadius: '12px', padding: '14px',
                    textAlign: 'center', fontSize: '13px',
                    color: 'var(--color-brand)', fontWeight: '600'
                  }}>
                    👤 Your service
                  </div>
                  {onBoost && (
                    <button onClick={onBoost} style={{
                      flex: 1, background: 'var(--color-warning-gold-soft)', border: '1.5px solid var(--color-warning-gold-border)',
                      borderRadius: '12px', padding: '14px', fontSize: '13px',
                      fontWeight: '700', color: 'var(--color-warning-gold)', cursor: 'pointer', fontFamily: 'inherit',
                    }}>⚡ Boost</button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      onClose()
                      window.dispatchEvent(new CustomEvent('openChatWithUser', {
                        detail: { userId: service.worker_id }
                      }))
                    }}
                    style={{
                      flex: 1, background: 'var(--color-page)',
                      border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '12px', padding: '14px',
                      fontSize: '13px', fontWeight: '700',
                      color: 'var(--color-brand)', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px'
                    }}>
                    💬 Message
                  </button>
                  <button
                    onClick={handleOrder}
                    disabled={ordering}
                    style={{
                      flex: 2,
                      background: ordering
                        ? 'var(--color-brand-border-strong)'
                        : 'var(--color-brand-gradient)',
                      border: 'none', borderRadius: '12px', padding: '14px',
                      fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
                      cursor: ordering ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: ordering ? 'none' : '0 4px 20px rgba(108,71,255,0.35)'
                    }}>
                    {ordering ? '⏳ Ordering...' : `Order — $${activePackage?.price}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(1.03); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>

      {/* Lightbox */}
      {lightbox && service.images && service.images.length > 0 && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(10,8,30,0.96)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column'
          }}>
          <button 
            onClick={() => setLightbox(false)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'rgba(255,255,255,0.1)', border: 'none',
              borderRadius: '50%', width: '40px', height: '40px',
              color: 'var(--color-surface)', fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>×</button>

          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: '90vw', maxHeight: '80vh', position: 'relative'
          }}>
            <img
              src={service.images[currentImage]}
              alt=""
              style={{
                maxWidth: '90vw', maxHeight: '80vh',
                objectFit: 'contain', borderRadius: '12px',
                animation: 'fadeInScale 0.2s ease'
              }}
            />
            {service.images.length > 1 && (
              <>
                <button onClick={() => setCurrentImage(i => (i - 1 + service.images.length) % service.images.length)}
                  style={{
                    position: 'absolute', left: '-48px', top: '50%',
                    transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)',
                    border: 'none', borderRadius: '50%', width: '40px', height: '40px',
                    color: 'var(--color-surface)', fontSize: '20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>‹</button>
                <button onClick={() => setCurrentImage(i => (i + 1) % service.images.length)}
                  style={{
                    position: 'absolute', right: '-48px', top: '50%',
                    transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)',
                    border: 'none', borderRadius: '50%', width: '40px', height: '40px',
                    color: 'var(--color-surface)', fontSize: '20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>›</button>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
