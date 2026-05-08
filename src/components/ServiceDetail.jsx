import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

const PACKAGE_COLORS = {
  basic: { color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
  standard: { color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  premium: { color: '#FFB800', bg: '#FFF8E0', border: '#FFD966' },
}

export default function ServiceDetail({ service, onClose, onViewProfile }) {
  const { user } = useAuth()
  const [selectedPackage, setSelectedPackage] = useState('basic')
  const [ordering, setOrdering] = useState(false)
  const [ordered, setOrdered] = useState(false)
  const [requirements, setRequirements] = useState('')

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
    if (!user) { alert('Please log in to order'); return }
    if (isOwnService) { alert("You can't order your own service"); return }
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

      // Open chat with worker
      window.dispatchEvent(new CustomEvent('openChatWithUser', {
        detail: { userId: service.worker_id, gigId: null }
      }))

      setOrdered(true)
    } catch (e) {
      alert('Error placing order: ' + e.message)
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
        background: '#fff',
        borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '640px',
        maxHeight: '92vh', overflowY: 'auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        <div style={{
          width: '40px', height: '4px',
          background: '#E2E0FF', borderRadius: '2px',
          margin: '12px auto 0'
        }} />

        <div style={{ padding: '20px' }}>
          {ordered ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
              <div style={{
                fontSize: '22px', fontWeight: '800',
                color: '#6C47FF', marginBottom: '8px'
              }}>Order Placed!</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF',
                lineHeight: '1.6', marginBottom: '20px'
              }}>
                The worker has been notified. A chat has been opened so you can share your requirements.
              </div>
              <button onClick={onClose} style={{
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px',
                padding: '13px 32px', fontSize: '14px',
                fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>Go to Chat →</button>
            </div>
          ) : (
            <>
              {/* Worker info */}
              <div style={{
                display: 'flex', gap: '12px',
                alignItems: 'center', marginBottom: '16px'
              }}>
                <div
                  onClick={() => onViewProfile(service.users?.id)}
                  style={{
                    width: '48px', height: '48px', borderRadius: '13px',
                    background: '#EEE9FF', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: '800', color: '#6C47FF',
                    overflow: 'hidden', flexShrink: 0,
                    cursor: 'pointer', border: '2px solid #B8A5FF'
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
                      color: '#6C47FF', cursor: 'pointer', marginBottom: '2px'
                    }}>
                    {service.users?.full_name || 'Unknown'} →
                  </div>
                  <div style={{ fontSize: '11px', color: '#8B8FAF' }}>
                    ⭐ {service.users?.rating || 5.0} ·{' '}
                    Trust {service.users?.trust_score || 100}%
                  </div>
                </div>
              </div>

              {/* Title */}
              <h2 style={{
                fontSize: '20px', fontWeight: '800',
                color: '#14123A', lineHeight: '1.3', marginBottom: '8px'
              }}>{service.title}</h2>

              {/* Description */}
              {service.description && (
                <div style={{
                  fontSize: '13px', color: '#5B5887',
                  lineHeight: '1.7', marginBottom: '20px'
                }}>{service.description}</div>
              )}

              {/* Package Selector */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
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
                          flex: 1, background: isActive ? c.bg : '#F5F4FF',
                          border: `1.5px solid ${isActive ? c.border : '#E2E0FF'}`,
                          borderRadius: '12px', padding: '12px 8px',
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.15s', textAlign: 'center'
                        }}>
                        <div style={{
                          fontSize: '16px', fontWeight: '800',
                          color: isActive ? c.color : '#14123A', marginBottom: '2px'
                        }}>${pkg.price}</div>
                        <div style={{
                          fontSize: '10px', fontWeight: '700',
                          color: isActive ? c.color : '#8B8FAF'
                        }}>{pkg.name}</div>
                        <div style={{
                          fontSize: '9px', color: '#A09DC8', marginTop: '2px'
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
                      fontSize: '12px', color: '#5B5887',
                      lineHeight: '1.6', marginBottom: '8px'
                    }}>{activePackage.desc}</div>
                  )}
                  <div style={{
                    display: 'flex', gap: '12px',
                    fontSize: '11px', color: '#8B8FAF'
                  }}>
                    <span>🕐 {activePackage.delivery} day{activePackage.delivery !== 1 ? 's' : ''} delivery</span>
                  </div>
                </div>
              )}

              {/* Requirements */}
              {!isOwnService && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    fontSize: '11px', fontWeight: '700', color: '#8B8FAF',
                    textTransform: 'uppercase', letterSpacing: '0.8px',
                    display: 'block', marginBottom: '7px'
                  }}>Share Requirements (optional)</label>
                  <textarea
                    value={requirements}
                    onChange={e => setRequirements(e.target.value)}
                    placeholder="Describe what you need, share any references, links or details..."
                    style={{
                      width: '100%', background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF', borderRadius: '10px',
                      padding: '12px 14px', fontSize: '13px',
                      color: '#14123A', fontFamily: 'inherit',
                      outline: 'none', resize: 'vertical',
                      minHeight: '80px', boxSizing: 'border-box'
                    }}
                    onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                    onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  />
                </div>
              )}

              {/* Action Buttons */}
              {isOwnService ? (
                <div style={{
                  background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                  borderRadius: '12px', padding: '14px',
                  textAlign: 'center', fontSize: '13px',
                  color: '#6C47FF', fontWeight: '600'
                }}>
                  👤 This is your service
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      onClose()
                      window.dispatchEvent(new CustomEvent('openChatWithUser', {
                        detail: { userId: service.worker_id, gigId: null }
                      }))
                    }}
                    style={{
                      flex: 1, background: '#F5F4FF',
                      border: '1.5px solid #B8A5FF',
                      borderRadius: '12px', padding: '14px',
                      fontSize: '13px', fontWeight: '700',
                      color: '#6C47FF', cursor: 'pointer',
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
                        ? '#B8A5FF'
                        : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                      border: 'none', borderRadius: '12px', padding: '14px',
                      fontSize: '14px', fontWeight: '700', color: '#fff',
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
        `}</style>
      </div>
    </div>
  )
}