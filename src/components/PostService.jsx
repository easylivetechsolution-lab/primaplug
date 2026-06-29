import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import CategoryPicker from './CategoryPicker'
import { showToast } from '../utils/toast'

const inputStyle = {
  width: '100%',
  background: '#F5F4FF',
  border: '1.5px solid #E2E0FF',
  borderRadius: '10px',
  padding: '11px 14px',
  fontSize: '13px',
  color: '#14123A',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s'
}

const labelStyle = {
  fontSize: '10px',
  fontWeight: '700',
  color: '#8B8FAF',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  display: 'block',
  marginBottom: '6px'
}

export default function PostService({ onClose, onPosted }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])
  const [images, setImages] = useState([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    field: '',
    category: '',
    type: 'digital',
    delivery_time: 1,
    basic_name: 'Basic',
    basic_desc: '',
    basic_price: '',
    basic_delivery: 1,
    standard_name: 'Standard',
    standard_desc: '',
    standard_price: '',
    standard_delivery: 3,
    premium_name: 'Premium',
    premium_desc: '',
    premium_price: '',
    premium_delivery: 7,
  })

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      showToast('Please add a service title', 'error')
      return
    }
    if (!form.basic_price) {
      showToast('Please set at least the Basic package price', 'error')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('services').insert({
        worker_id: user.id,
        images: images.length > 0 ? images : null,
        title: form.title,
        description: form.description,
        field: form.field,
        category: form.category,
        type: form.type,
        delivery_time: form.delivery_time,
        basic_name: form.basic_name,
        basic_desc: form.basic_desc,
        basic_price: parseFloat(form.basic_price) || 0,
        basic_delivery: parseInt(form.basic_delivery) || 1,
        standard_name: form.standard_name,
        standard_desc: form.standard_desc,
        standard_price: parseFloat(form.standard_price) || null,
        standard_delivery: parseInt(form.standard_delivery) || 3,
        premium_name: form.premium_name,
        premium_desc: form.premium_desc,
        premium_price: parseFloat(form.premium_price) || null,
        premium_delivery: parseInt(form.premium_delivery) || 7,
        is_active: true,
      })

      if (error) throw error
      setDone(true)
      setTimeout(() => {
        onPosted && onPosted()
        onClose()
      }, 2000)
    } catch (e) {
      showToast('Error posting service: ' + e.message, 'error')
    }
    setLoading(false)
  }

  const PACKAGE_COLORS = {
    basic: { color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
    standard: { color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
    premium: { color: '#FFB800', bg: '#FFF8E0', border: '#FFD966' },
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '24px',
        width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflowY: 'auto',
        border: '1.5px solid #E2E0FF',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 24px 0',
          position: 'sticky', top: 0,
          background: '#fff', zIndex: 10,
          borderRadius: '24px 24px 0 0'
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '20px'
          }}>
            <div>
              <div style={{
                fontSize: '10px', color: '#6C47FF', fontWeight: '700',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                marginBottom: '3px'
              }}>
                {done ? 'Published!' : `Step ${step} of 3`}
              </div>
              <div style={{
                fontSize: '20px', fontWeight: '800', color: '#14123A'
              }}>
                {done ? '🎉 Service Live!' :
                  step === 1 ? 'Service Details' :
                  step === 2 ? 'Set Your Packages' :
                  'Review & Publish'}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '10px', width: '36px', height: '36px',
              fontSize: '18px', color: '#8B8FAF', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontFamily: 'inherit'
            }}>×</button>
          </div>

          {/* Progress */}
          {!done && (
            <div style={{
              display: 'flex', gap: '6px', marginBottom: '20px'
            }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{
                  flex: 1, height: '4px', borderRadius: '2px',
                  background: s <= step
                    ? 'linear-gradient(90deg, #6C47FF, #9B59FF)'
                    : '#E2E0FF',
                  transition: 'background 0.3s'
                }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          {/* DONE STATE */}
          {done && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚀</div>
              <div style={{
                fontSize: '18px', fontWeight: '800',
                color: '#6C47FF', marginBottom: '8px'
              }}>Your service is live!</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF', lineHeight: '1.6'
              }}>
                Clients can now find and order your service on Prima.
              </div>
            </div>
          )}

          {/* STEP 1 — Details */}
          {!done && step === 1 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '16px'
            }}>
              <div>
                <label style={labelStyle}>Service Title</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. I will design a professional logo"
                  value={form.title}
                  onChange={e => update('title', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
                <div style={{
                  fontSize: '10px', color: '#A09DC8', marginTop: '4px'
                }}>
                  Start with "I will..." for best results
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                  placeholder="Describe what you offer, your experience, what clients can expect..."
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>

              <div>
                <label style={labelStyle}>Field / Category</label>
                <CategoryPicker
                  selected={form.field}
                  onSelect={(field) => update('field', field)}
                  customSkill={form.category}
                  onCustomSkill={(val) => update('category', val)}
                />
              </div>

              <div>
                <label style={labelStyle}>Service Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { key: 'digital', label: '💻 Digital', sub: 'Online delivery' },
                    { key: 'physical', label: '📌 Physical', sub: 'In person' },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => update('type', t.key)}
                      style={{
                        flex: 1,
                        background: form.type === t.key ? '#EEE9FF' : '#F5F4FF',
                        border: `1.5px solid ${form.type === t.key ? '#B8A5FF' : '#E2E0FF'}`,
                        borderRadius: '12px', padding: '12px',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s', textAlign: 'center'
                      }}>
                      <div style={{ fontSize: '16px', marginBottom: '3px' }}>
                        {t.label}
                      </div>
                      <div style={{
                        fontSize: '10px', color: '#A09DC8', fontWeight: '600'
                      }}>{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label style={labelStyle}>
                  Portfolio Images
                  <span style={{
                    fontSize: '9px', color: '#A09DC8',
                    fontWeight: '500', marginLeft: '6px',
                    textTransform: 'none', letterSpacing: 0
                  }}>Up to 5 images</span>
                </label>
                <div style={{
                  display: 'flex', gap: '8px', flexWrap: 'wrap'
                }}>
                  {images.map((url, i) => (
                    <div key={url} style={{
                      width: '80px', height: '80px',
                      borderRadius: '10px', overflow: 'hidden',
                      border: '1.5px solid #B8A5FF',
                      position: 'relative', flexShrink: 0
                    }}>
                      <img src={url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        onClick={() => setImages(imgs => imgs.filter((_, idx) => idx !== i))}
                        style={{
                          position: 'absolute', top: '3px', right: '3px',
                          width: '18px', height: '18px', borderRadius: '50%',
                          background: 'rgba(20,18,58,0.7)', border: 'none',
                          color: '#fff', fontSize: '10px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'inherit'
                        }}>×</button>
                    </div>
                  ))}
                  {images.length < 5 && (
                    <label style={{
                      width: '80px', height: '80px', borderRadius: '10px',
                      border: '1.5px dashed #B8A5FF',
                      background: '#F5F4FF', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: '4px', flexShrink: 0
                    }}>
                      <span style={{ fontSize: '20px' }}>📷</span>
                      <span style={{ fontSize: '9px', color: '#A09DC8', fontWeight: '600' }}>
                        {uploadingImages ? 'Uploading...' : 'Add'}
                      </span>
                      <input
                        type="file" accept="image/*" multiple
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files)
                          if (files.length === 0) return

                          const remaining = 5 - images.length
                          const toUpload = files.slice(0, remaining)
                          setUploadingImages(true)

                          const uploaded = []
                          for (const file of toUpload) {
                            try {
                              const ext = file.name.split('.').pop().toLowerCase()
                              const fileName = `service-${user.id}-${Date.now()}-${Math.round(Math.random() * 10000)}.${ext}`

                              console.log('Uploading:', fileName)

                              const { data, error } = await supabase.storage
                                .from('service-images')
                                .upload(fileName, file, {
                                  cacheControl: '3600',
                                  upsert: false,
                                  contentType: file.type
                                })

                              if (error) {
                                console.error('Upload error:', error)
                                showToast(`Upload failed: ${error.message}`, 'error')
                                continue
                              }

                              console.log('Upload success:', data)

                              const { data: urlData } = supabase.storage
                                .from('service-images')
                                .getPublicUrl(fileName)

                              console.log('Public URL:', urlData.publicUrl)
                              uploaded.push(urlData.publicUrl)

                            } catch (err) {
                              console.error('Unexpected error:', err)
                            }
                          }

                          setImages(prev => [...prev, ...uploaded])
                          setUploadingImages(false)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
                {images.length > 0 && images.length < 3 && (
                  <div style={{
                    fontSize: '10px', color: '#FF6B2B', marginTop: '6px'
                  }}>
                    💡 Add at least 3 images for better visibility
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2 — Packages */}
          {!done && step === 2 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              <div style={{
                fontSize: '12px', color: '#8B8FAF',
                lineHeight: '1.6', marginBottom: '4px'
              }}>
                Set up to 3 pricing tiers. Basic is required. Standard and Premium are optional.
              </div>

              {['basic', 'standard', 'premium'].map(tier => {
                const colors = PACKAGE_COLORS[tier]
                const isRequired = tier === 'basic'
                const nameKey = `${tier}_name`
                const descKey = `${tier}_desc`
                const priceKey = `${tier}_price`
                const delivKey = `${tier}_delivery`

                return (
                  <div key={tier} style={{
                    background: colors.bg,
                    border: `1.5px solid ${colors.border}`,
                    borderRadius: '16px', padding: '16px'
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '14px'
                    }}>
                      <div style={{
                        fontSize: '13px', fontWeight: '800',
                        color: colors.color, textTransform: 'uppercase',
                        letterSpacing: '0.8px'
                      }}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </div>
                      {!isRequired && (
                        <span style={{
                          fontSize: '9px', color: '#A09DC8',
                          fontWeight: '600', textTransform: 'uppercase'
                        }}>Optional</span>
                      )}
                      {isRequired && (
                        <span style={{
                          background: colors.color, color: '#fff',
                          borderRadius: '5px', padding: '2px 7px',
                          fontSize: '9px', fontWeight: '700'
                        }}>Required</span>
                      )}
                    </div>

                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: '10px'
                    }}>
                      <div>
                        <label style={{ ...labelStyle, color: colors.color }}>
                          Package Name
                        </label>
                        <input
                          style={{ ...inputStyle, background: '#fff' }}
                          placeholder={`e.g. ${tier.charAt(0).toUpperCase() + tier.slice(1)} Package`}
                          value={form[nameKey]}
                          onChange={e => update(nameKey, e.target.value)}
                          onFocus={e => e.target.style.borderColor = colors.border}
                          onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, color: colors.color }}>
                          What's included
                        </label>
                        <textarea
                          style={{
                            ...inputStyle, background: '#fff',
                            minHeight: '60px', resize: 'vertical'
                          }}
                          placeholder="Describe what this package includes..."
                          value={form[descKey]}
                          onChange={e => update(descKey, e.target.value)}
                          onFocus={e => e.target.style.borderColor = colors.border}
                          onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                        />
                      </div>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'
                      }}>
                        <div>
                          <label style={{ ...labelStyle, color: colors.color }}>
                            Price ($)
                          </label>
                          <input
                            type="number"
                            style={{ ...inputStyle, background: '#fff' }}
                            placeholder="0"
                            value={form[priceKey]}
                            onChange={e => update(priceKey, e.target.value)}
                            onFocus={e => e.target.style.borderColor = colors.border}
                            onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, color: colors.color }}>
                            Delivery (days)
                          </label>
                          <input
                            type="number"
                            style={{ ...inputStyle, background: '#fff' }}
                            placeholder="1"
                            value={form[delivKey]}
                            onChange={e => update(delivKey, e.target.value)}
                            onFocus={e => e.target.style.borderColor = colors.border}
                            onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* STEP 3 — Review */}
          {!done && step === 3 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              {/* Service summary */}
              <div style={{
                background: '#F5F4FF', borderRadius: '14px',
                padding: '16px', border: '1.5px solid #E2E0FF'
              }}>
                <div style={{
                  fontSize: '16px', fontWeight: '800',
                  color: '#14123A', marginBottom: '6px'
                }}>{form.title || 'Untitled Service'}</div>
                {form.field && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    gap: '5px', background: '#EEE9FF',
                    border: '1px solid #B8A5FF', borderRadius: '6px',
                    padding: '3px 9px', fontSize: '11px',
                    fontWeight: '600', color: '#6C47FF', marginBottom: '8px'
                  }}>{form.field}</div>
                )}
                {form.description && (
                  <div style={{
                    fontSize: '12px', color: '#5B5887', lineHeight: '1.6'
                  }}>{form.description}</div>
                )}
              </div>

              {/* Package summary */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                {['basic', 'standard', 'premium'].map(tier => {
                  const price = form[`${tier}_price`]
                  if (!price) return null
                  const colors = PACKAGE_COLORS[tier]
                  return (
                    <div key={tier} style={{
                      background: colors.bg,
                      border: `1.5px solid ${colors.border}`,
                      borderRadius: '12px', padding: '12px 14px',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{
                          fontSize: '12px', fontWeight: '700',
                          color: colors.color, marginBottom: '2px'
                        }}>{form[`${tier}_name`]}</div>
                        <div style={{ fontSize: '10px', color: '#8B8FAF' }}>
                          {form[`${tier}_delivery`]} day delivery
                        </div>
                      </div>
                      <div style={{
                        fontSize: '18px', fontWeight: '800', color: colors.color
                      }}>${price}</div>
                    </div>
                  )
                })}
              </div>

              <div style={{
                background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                borderRadius: '12px', padding: '14px',
                fontSize: '12px', color: '#6C47FF', lineHeight: '1.6'
              }}>
                ✓ Your service will be visible to all Prima users immediately after publishing.
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          {!done && (
            <div style={{
              display: 'flex', gap: '10px', marginTop: '20px'
            }}>
              {step > 1 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{
                    flex: 1, background: '#F5F4FF',
                    border: '1.5px solid #E2E0FF',
                    borderRadius: '12px', padding: '14px',
                    fontSize: '13px', fontWeight: '600',
                    color: '#8B8FAF', cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>← Back</button>
              )}
              {step < 3 ? (
                <button
                  onClick={() => {
                    if (step === 1 && !form.title.trim()) {
                      showToast('Please add a service title', 'error')
                      return
                    }
                    setStep(s => s + 1)
                  }}
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                    border: 'none', borderRadius: '12px', padding: '14px',
                    fontSize: '14px', fontWeight: '700', color: '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
                  }}>Continue →</button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    flex: 2,
                    background: loading
                      ? '#B8A5FF'
                      : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                    border: 'none', borderRadius: '12px', padding: '14px',
                    fontSize: '14px', fontWeight: '700', color: '#fff',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: loading ? 'none' : '0 4px 20px rgba(108,71,255,0.35)'
                  }}>
                  {loading ? '⏳ Publishing...' : '🚀 Publish Service'}
                </button>
              )}
            </div>
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