import { useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import BrandIcon from '../BrandIcon'
import { useLanguage } from '../../context/LanguageContext'
import { LANGUAGES } from '../../data/languages'
import { CURRENCIES } from '../../data/currencies'
import { useCredits } from '../../context/CreditsContext'

export default function SettingsScreen({ onLogout }) {
  const { user } = useAuth()
  const { credits } = useCredits()
  const { language, setLanguage, currency, setCurrency, t } = useLanguage()
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [notifications, setNotifications] = useState({
    applications: true,
    messages: true,
    receipts: true,
    reviews: true,
    newGigs: true,
    sounds: true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const ToggleRow = ({ label, subLabel, settingKey, icon }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '14px 0',
      borderBottom: '1px solid #F5F4FF'
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <BrandIcon name={icon} size={34} active={notifications[settingKey]} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#14123A' }}>
            {label}
          </div>
          {subLabel && (
            <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '1px' }}>
              {subLabel}
            </div>
          )}
        </div>
      </div>
      <div
        onClick={() => toggle(settingKey)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px',
          background: notifications[settingKey] ? '#6C47FF' : '#E2E0FF',
          position: 'relative', cursor: 'pointer',
          transition: 'background 0.2s', flexShrink: 0
        }}>
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#fff', position: 'absolute',
          top: '3px', transition: 'left 0.2s',
          left: notifications[settingKey] ? '23px' : '3px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
        }} />
      </div>
    </div>
  )

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ fontSize: '22px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
        Settings
      </div>
      <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '24px' }}>
        Manage your Prima preferences
      </div>

      {/* Prima Credits Card */}
      <div style={{
        background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '14px', color: '#fff'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{
              fontSize: '11px', opacity: 0.8,
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: '4px'
            }}>Prima Credits Balance</div>
            <div style={{
              fontSize: '32px', fontWeight: '800',
              letterSpacing: '-1px', marginBottom: '3px'
            }}>
              {credits?.balance?.toFixed(0) || 0}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>
              ≈ ${((credits?.balance || 0) / 50).toFixed(2)} value · 50 credits = $1
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>
              Lifetime earned
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800' }}>
              {credits?.lifetime_earned?.toFixed(0) || 0}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'referral' }))}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '10px', padding: '9px',
              fontSize: '12px', fontWeight: '700',
              color: '#fff', cursor: 'pointer', fontFamily: 'inherit'
            }}>🎁 Refer & Earn</button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '10px', padding: '9px',
              fontSize: '12px', fontWeight: '700',
              color: '#fff', cursor: 'pointer', fontFamily: 'inherit'
            }}>💰 Commission</button>
        </div>
      </div>

      {/* Account */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E0FF',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '11px', fontWeight: '700', color: '#A09DC8',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>Account</div>
        <div style={{
          display: 'flex', gap: '12px', alignItems: 'center',
          padding: '4px 0'
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: '#EEE9FF', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: '800', color: '#6C47FF'
          }}>
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#14123A' }}>
              {user?.email}
            </div>
            <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '2px' }}>
              Prima Member
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E0FF',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '11px', fontWeight: '700', color: '#A09DC8',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '4px'
        }}>Notifications</div>

        <ToggleRow
          icon="applied"
          label="New Applications"
          subLabel="When someone applies to your gig"
          settingKey="applications"
        />
        <ToggleRow
          icon="accepted"
          label="Acceptances & Rejections"
          subLabel="Status updates on your applications"
          settingKey="messages"
        />
        <ToggleRow
          icon="receipt"
          label="Receipt Uploads"
          subLabel="When the other party uploads a receipt"
          settingKey="receipts"
        />
        <ToggleRow
          icon="reviews"
          label="New Reviews"
          subLabel="When someone reviews you"
          settingKey="reviews"
        />
        <ToggleRow
          icon="map"
          label="New Gigs Nearby"
          subLabel="When gigs are posted in your area"
          settingKey="newGigs"
        />
        <ToggleRow
          icon="sound"
          label="Notification Sounds"
          subLabel="Play sounds for new notifications"
          settingKey="sounds"
        />
      </div>

      {/* Privacy */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E0FF',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '11px', fontWeight: '700', color: '#A09DC8',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>Privacy</div>
        {[
          ['location', 'Show my location on map', 'Others can see your general area'],
          ['phone', 'Show phone number on gigs', 'Applicants can call or WhatsApp you'],
          ['profile', 'Public profile', 'Anyone can view your profile'],
        ].map(([icon, label, sub]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '12px 0',
            borderBottom: '1px solid #F5F4FF'
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <BrandIcon name={icon} size={34} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#14123A' }}>
                  {label}
                </div>
                <div style={{ fontSize: '11px', color: '#A09DC8', marginTop: '1px' }}>
                  {sub}
                </div>
              </div>
            </div>
            <div style={{
              width: '44px', height: '24px', borderRadius: '12px',
              background: '#6C47FF', position: 'relative', cursor: 'pointer'
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#fff', position: 'absolute',
                top: '3px', left: '23px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Language & Currency */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E0FF',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '11px', fontWeight: '700', color: '#A09DC8',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>Language & Currency</div>

        {/* Language selector */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '12px 0',
          borderBottom: '1px solid #F5F4FF',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>🌍</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#14123A' }}>
                {t('language')}
              </div>
              <div style={{ fontSize: '11px', color: '#A09DC8' }}>App display language</div>
            </div>
          </div>
          <button
            onClick={() => { setShowLangPicker(s => !s); setShowCurrencyPicker(false) }}
            style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '10px', padding: '7px 12px',
              fontSize: '13px', fontWeight: '600', color: '#14123A',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '7px'
            }}>
            <span>{LANGUAGES.find(l => l.code === language)?.flag}</span>
            <span>{LANGUAGES.find(l => l.code === language)?.native}</span>
            <span style={{ fontSize: '10px', color: '#A09DC8' }}>▼</span>
          </button>

          {showLangPicker && (
            <div style={{
              position: 'absolute', top: '50px', right: 0,
              background: '#fff', border: '1.5px solid #E2E0FF',
              borderRadius: '14px', padding: '8px',
              zIndex: 100, minWidth: '220px',
              boxShadow: '0 8px 32px rgba(108,71,255,0.15)',
              maxHeight: '280px', overflowY: 'auto'
            }}>
              {LANGUAGES.map(lang => (
                <div
                  key={lang.code}
                  onClick={() => { setLanguage(lang.code); setShowLangPicker(false) }}
                  style={{
                    display: 'flex', gap: '10px', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '10px',
                    cursor: 'pointer',
                    background: language === lang.code ? '#EEE9FF' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                  onMouseLeave={e => e.currentTarget.style.background =
                    language === lang.code ? '#EEE9FF' : 'transparent'}
                >
                  <span style={{ fontSize: '20px' }}>{lang.flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: language === lang.code ? '700' : '500',
                      color: language === lang.code ? '#6C47FF' : '#14123A'
                    }}>{lang.native}</div>
                    <div style={{ fontSize: '10px', color: '#A09DC8' }}>{lang.name}</div>
                  </div>
                  {language === lang.code && (
                    <span style={{ color: '#6C47FF', fontSize: '14px' }}>✓</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Currency selector */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '12px 0',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>💱</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#14123A' }}>
                {t('currency')}
              </div>
              <div style={{ fontSize: '11px', color: '#A09DC8' }}>Default display currency</div>
            </div>
          </div>
          <button
            onClick={() => { setShowCurrencyPicker(s => !s); setShowLangPicker(false) }}
            style={{
              background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '10px', padding: '7px 12px',
              fontSize: '13px', fontWeight: '600', color: '#14123A',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '7px'
            }}>
            <span>{CURRENCIES.find(c => c.code === currency)?.flag}</span>
            <span>{currency}</span>
            <span style={{ fontSize: '10px', color: '#A09DC8' }}>▼</span>
          </button>

          {showCurrencyPicker && (
            <div style={{
              position: 'absolute', top: '50px', right: 0,
              background: '#fff', border: '1.5px solid #E2E0FF',
              borderRadius: '14px', padding: '8px',
              zIndex: 100, minWidth: '240px',
              boxShadow: '0 8px 32px rgba(108,71,255,0.15)',
              maxHeight: '280px', overflowY: 'auto'
            }}>
              {CURRENCIES.map(curr => (
                <div
                  key={curr.code}
                  onClick={() => { setCurrency(curr.code); setShowCurrencyPicker(false) }}
                  style={{
                    display: 'flex', gap: '10px', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '10px',
                    cursor: 'pointer',
                    background: currency === curr.code ? '#EEE9FF' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                  onMouseLeave={e => e.currentTarget.style.background =
                    currency === curr.code ? '#EEE9FF' : 'transparent'}
                >
                  <span style={{ fontSize: '20px' }}>{curr.flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: currency === curr.code ? '700' : '500',
                      color: currency === curr.code ? '#6C47FF' : '#14123A'
                    }}>{curr.code} — {curr.symbol}</div>
                    <div style={{ fontSize: '10px', color: '#A09DC8' }}>{curr.name}</div>
                  </div>
                  {currency === curr.code && (
                    <span style={{ color: '#6C47FF', fontSize: '14px' }}>✓</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          background: saved
            ? '#DFFDF4'
            : saving
              ? '#B8A5FF'
              : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
          border: saved ? '1.5px solid #7EECD2' : 'none',
          borderRadius: '12px', padding: '14px',
          fontSize: '14px', fontWeight: '700',
          color: saved ? '#00C48C' : '#fff',
          cursor: saving ? 'not-allowed' : 'pointer',
          boxShadow: saved || saving ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
          fontFamily: 'inherit', marginBottom: '12px',
          transition: 'all 0.2s'
        }}>
        {saved ? '✓ Settings Saved!' : saving ? '⏳ Saving...' : 'Save Settings'}
      </button>

      {/* Logout */}
      <button onClick={onLogout} style={{
        width: '100%', background: '#FFE8EE',
        border: '1.5px solid #FF99B3', borderRadius: '12px',
        padding: '14px', fontSize: '14px', fontWeight: '700',
        color: '#FF3366', cursor: 'pointer', fontFamily: 'inherit'
      }}>Log Out of Prima</button>
    </div>
  )
}
