import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import CategoryPicker from './CategoryPicker'
import { CURRENCIES } from '../data/currencies'

const inputStyle = {
  width: '100%', background: '#F5F4FF',
  border: '1.5px solid #E2E0FF', borderRadius: '10px',
  padding: '11px 14px', fontSize: '13px', color: '#14123A',
  fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s'
}

const labelStyle = {
  fontSize: '10px', fontWeight: '700', color: '#8B8FAF',
  textTransform: 'uppercase', letterSpacing: '0.8px',
  display: 'block', marginBottom: '6px'
}

const PACKAGE_COLORS = {
  basic: { color: '#00C48C', bg: '#DFFDF4', border: '#7EECD2' },
  standard: { color: '#6C47FF', bg: '#EEE9FF', border: '#B8A5FF' },
  premium: { color: '#FFB800', bg: '#FFF8E0', border: '#FFD966' },
}

export default function EditService({ service, onClose, onUpdated }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [activeTab, setActiveTab] = useState('details')

  const [form, setForm] = useState({
    title: service.title || '',
    description: service.description || '',
    field: service.field || '',
    category: service.category || '',
    type: service.type || 'digital',
    currency: service.currency || 'USD',
    images: service.images || [],
    basic_name: service.basic_name || 'Basic',
    basic_desc: service.basic_desc || '',
    basic_price: service.basic_price || '',
    basic_delivery: service.basic_delivery || 1,
    standard_name: service.standard_name || 'Standard',
    standard_desc: service.standard_desc || '',
    standard_price: service.standard_price || '',
    standard_delivery: service.standard_delivery || 3,
    premium_name: service.premium_name || 'Premium',
    premium_desc: service.premium_desc || '',
    premium_price: service.premium_price || '',
    premium_delivery: service.premium_delivery || 7,
    is_active: service.is_active !== false,
  })

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const remaining = 5 - form.images.length
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
          alert(`Upload failed: ${error.message}`)
          continue
        }

        const { data: urlData } = supabase.storage
          .from('service-images')
          .getPublicUrl(fileName)

        uploaded.push(urlData.publicUrl)

      } catch (err) {
        console.error('Unexpected error:', err)
      }
    }

    update('images', [...form.images, ...uploaded])
    setUploadingImages(false)
    e.target.value = ''
  }

  const removeImage = (index) => {
    update('images', form.images.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert('Please add a title')
      return
    }
    if (!form.basic_price) {
      alert('Please set at least the Basic package price')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('services')
      .update({
        title: form.title,
        description: form.description,
        field: form.field,
        category: form.category,
        type: form.type,
        currency: form.currency,
        images: form.images,
        is_active: form.is_active,
        basic_name: form.basic_name,
        basic_desc: form.basic_desc,
        basic_price: parseFloat(form.basic_price) || 0,
        basic_delivery: parseInt(form.basic_delivery) || 1,
        standard_name: form.standard_name,
        standard_desc: form.standard_desc,
        standard_price: form.standard_price
          ? parseFloat(form.standard_price) : null,
        standard_delivery: parseInt(form.standard_delivery) || 3,
        premium_name: form.premium_name,
        premium_desc: form.premium_desc,
        premium_price: form.premium_price
          ? parseFloat(form.premium_price) : null,
        premium_delivery: parseInt(form.premium_delivery) || 7,
      })
      .eq('id', service.id)

    if (error) {
      alert('Error updating: ' + error.message)
      setSaving(false)
      return
    }
    setSaved(true)
    setTimeout(() => {
      onUpdated && onUpdated()
      onClose()
    }, 1500)
    setSaving(false)
  }

  const tabs = [
    { key: 'details', label: '📝 Details' },
    { key: 'packages', label: '💰 Packages' },
    { key: 'images', label: `📸 Images (${form.images.length})` },
  ]

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
          borderRadius: '24px 24px 0 0',
          borderBottom: '1px solid #F5F4FF',
          paddingBottom: '0'
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '16px'
          }}>
            <div>
              <div style={{
                fontSize: '10px', color: '#6C47FF', fontWeight: '700',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                marginBottom: '3px'
              }}>Edit Service</div>
              <div style={{
                fontSize: '18px', fontWeight: '800',
                color: '#14123A',
                maxWidth: '300px', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{service.title}</div>
            </div>
            <button onClick={onClose} style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '10px', width: '36px', height: '36px',
              fontSize: '18px', color: '#8B8FAF', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontFamily: 'inherit',
              flexShrink: 0
            }}>×</button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: '4px', paddingBottom: '0'
          }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, background: 'transparent',
                  border: 'none', borderBottom: `2px solid ${activeTab === tab.key ? '#6C47FF' : 'transparent'}`,
                  padding: '10px 4px', fontSize: '12px',
                  fontWeight: activeTab === tab.key ? '700' : '500',
                  color: activeTab === tab.key ? '#6C47FF' : '#8B8FAF',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s', whiteSpace: 'nowrap'
                }}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          {saved && (
            <div style={{
              background: '#DFFDF4', border: '1.5px solid #7EECD2',
              borderRadius: '12px', padding: '12px 16px',
              fontSize: '13px', fontWeight: '700',
              color: '#00C48C', textAlign: 'center',
              marginBottom: '16px'
            }}>✓ Service updated successfully!</div>
          )}

          {/* DETAILS TAB */}
          {activeTab === 'details' && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '16px'
            }}>
              {/* Active toggle */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', background: '#F5F4FF',
                borderRadius: '12px', padding: '12px 14px'
              }}>
                <div>
                  <div style={{
                    fontSize: '13px', fontWeight: '600', color: '#14123A'
                  }}>Service Active</div>
                  <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                    {form.is_active
                      ? 'Visible to everyone'
                      : 'Hidden from listings'}
                  </div>
                </div>
                <div
                  onClick={() => update('is_active', !form.is_active)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px',
                    background: form.is_active ? '#6C47FF' : '#E2E0FF',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#fff', position: 'absolute',
                    top: '3px', transition: 'left 0.2s',
                    left: form.is_active ? '23px' : '3px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                  }} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Service Title</label>
                <input
                  style={inputStyle}
                  value={form.title}
                  onChange={e => update('title', e.target.value)}
                  placeholder="e.g. I will design a professional logo"
                  onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                  onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  placeholder="Describe your service..."
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
                        textAlign: 'center'
                      }}>
                      <div style={{ fontSize: '15px', marginBottom: '3px' }}>
                        {t.label}
                      </div>
                      <div style={{
                        fontSize: '10px', color: '#A09DC8', fontWeight: '600'
                      }}>{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Currency</label>
                <select
                  value={form.currency}
                  onChange={e => update('currency', e.target.value)}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* PACKAGES TAB */}
          {activeTab === 'packages' && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              <div style={{
                fontSize: '12px', color: '#8B8FAF', lineHeight: '1.6'
              }}>
                Basic is required. Standard and Premium are optional.
              </div>

              {['basic', 'standard', 'premium'].map(tier => {
                const colors = PACKAGE_COLORS[tier]
                const isRequired = tier === 'basic'
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
                      {isRequired ? (
                        <span style={{
                          background: colors.color, color: '#fff',
                          borderRadius: '5px', padding: '2px 7px',
                          fontSize: '9px', fontWeight: '700'
                        }}>Required</span>
                      ) : (
                        <span style={{
                          fontSize: '9px', color: '#A09DC8',
                          fontWeight: '600', textTransform: 'uppercase'
                        }}>Optional</span>
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
                          value={form[`${tier}_name`]}
                          onChange={e => update(`${tier}_name`, e.target.value)}
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
                          value={form[`${tier}_desc`]}
                          onChange={e => update(`${tier}_desc`, e.target.value)}
                          placeholder="Describe what's included..."
                          onFocus={e => e.target.style.borderColor = colors.border}
                          onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                        />
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr', gap: '8px'
                      }}>
                        <div>
                          <label style={{ ...labelStyle, color: colors.color }}>
                            Price
                          </label>
                          <input
                            type="number"
                            style={{ ...inputStyle, background: '#fff' }}
                            value={form[`${tier}_price`]}
                            onChange={e => update(`${tier}_price`, e.target.value)}
                            placeholder="0"
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
                            value={form[`${tier}_delivery`]}
                            onChange={e => update(`${tier}_delivery`, e.target.value)}
                            placeholder="1"
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

          {/* IMAGES TAB */}
          {activeTab === 'images' && (
            <div>
              <div style={{
                fontSize: '12px', color: '#8B8FAF',
                lineHeight: '1.6', marginBottom: '14px'
              }}>
                Upload 3–5 images showing your work. First image appears as the cover.
              </div>

              {/* Current images */}
              {form.images.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px', marginBottom: '14px'
                }}>
                  {form.images.map((url, i) => (
                    <div key={i} style={{ position: 'relative', aspectRatio: '1' }}>
                      <img src={url} alt=""
                        style={{
                          width: '100%', height: '100%',
                          borderRadius: '10px', objectFit: 'cover',
                          border: i === 0
                            ? '2px solid #6C47FF'
                            : '1.5px solid #E2E0FF'
                        }} />
                      {i === 0 && (
                        <div style={{
                          position: 'absolute', bottom: '5px', left: '5px',
                          background: '#6C47FF', color: '#fff',
                          borderRadius: '5px', padding: '2px 6px',
                          fontSize: '8px', fontWeight: '700'
                        }}>COVER</div>
                      )}
                      <button
                        onClick={() => removeImage(i)}
                        style={{
                          position: 'absolute', top: '-6px', right: '-6px',
                          width: '22px', height: '22px', borderRadius: '50%',
                          background: '#FF3366', border: '2px solid #fff',
                          color: '#fff', fontSize: '11px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontFamily: 'inherit'
                        }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {form.images.length < 5 && (
                <div
                  onClick={() => document.getElementById('edit-svc-img').click()}
                  style={{
                    background: '#F5F4FF', border: '2px dashed #B8A5FF',
                    borderRadius: '12px', padding: '24px',
                    textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.15s', marginBottom: '10px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEE9FF'}
                  onMouseLeave={e => e.currentTarget.style.background = '#F5F4FF'}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>
                    {uploadingImages ? '⏳' : '📸'}
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700',
                    color: '#6C47FF', marginBottom: '4px'
                  }}>
                    {uploadingImages ? 'Uploading...' : 'Add More Photos'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                    {form.images.length}/5 uploaded
                  </div>
                  <input
                    id="edit-svc-img"
                    type="file" accept="image/*" multiple
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                </div>
              )}

              {form.images.length < 3 && (
                <div style={{
                  background: '#FFF0E8', border: '1.5px solid #FFBC99',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: '#FF6B2B',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <span>⚠️</span>
                  <span>Please upload at least 3 images for best results</span>
                </div>
              )}

              {form.images.length > 0 && (
                <div style={{
                  fontSize: '11px', color: '#A09DC8',
                  marginTop: '8px', lineHeight: '1.5'
                }}>
                  💡 Drag to reorder coming soon. First image is always the cover.
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', marginTop: '20px',
              background: saving
                ? '#B8A5FF'
                : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: '14px', fontWeight: '700', color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: saving ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
              fontFamily: 'inherit', transition: 'all 0.2s'
            }}>
            {saving ? '⏳ Saving...' : '✓ Save Changes'}
          </button>
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