import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import BrandIcon from '../BrandIcon'
import { useLanguage } from '../../context/LanguageContext'
import { SUPPORTED_LANGUAGES } from '../../data/languages'
import { CURRENCIES } from '../../data/currencies'
import { useCredits } from '../../context/CreditsContext'
import { CREDITS_PER_DOLLAR } from '../../utils/payments'
import EmergencyReport from '../EmergencyReport'
import { showToast } from '../../utils/toast'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../utils/notificationPreferences'
import { translateSetting } from '../../data/settingsTranslations'
const DEFAULT_PRIVACY_PREFERENCES = { location: true, phone: true, profile: true }

const readLocalPreferences = (userId, key, fallback) => {
  try {
    const value = localStorage.getItem(`prima_${key}_${userId}`)
    return value ? { ...fallback, ...JSON.parse(value) } : fallback
  } catch {
    return fallback
  }
}

function PreferenceSwitch({ label, checked, onChange, onLabel = 'on', offLabel = 'off' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      title={`${label}: ${checked ? onLabel : offLabel}`}
      onClick={onChange}
      style={{
        width: '44px', minWidth: '44px', height: '44px', minHeight: '44px',
        padding: 0, border: 0, borderRadius: '12px', background: 'transparent',
        display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer',
      }}
    >
      <span style={{
        width: '38px', height: '22px', borderRadius: '999px', position: 'relative',
        display: 'block', background: checked ? 'var(--color-brand)' : 'var(--color-border)',
        transition: 'background 0.18s ease',
      }}>
        <span style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: 'var(--color-surface)', position: 'absolute', top: '3px', left: '3px',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.18s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
        }} />
      </span>
    </button>
  )
}

export default function SettingsScreen({ onLogout }) {
  const { user } = useAuth()
  const { credits } = useCredits()
  const { language, setLanguage, currency, setCurrency, t } = useLanguage()
  const st = (key) => translateSetting(language, key)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [notifications, setNotifications] = useState(() =>
    readLocalPreferences(user?.id || 'guest', 'notification_preferences', DEFAULT_NOTIFICATION_PREFERENCES))
  const [privacy, setPrivacy] = useState(() =>
    readLocalPreferences(user?.id || 'guest', 'privacy_preferences', DEFAULT_PRIVACY_PREFERENCES))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  const [showIOSSteps, setShowIOSSteps] = useState(false)

  const handleLanguageChange = async (code) => {
    setShowLangPicker(false)
    const result = await setLanguage(code)
    if (result?.error) showToast(st('changedLocal'), 'error')
  }

  const handleCurrencyChange = async (code) => {
    setShowCurrencyPicker(false)
    const result = await setCurrency(code)
    if (result?.error) showToast(st('changedLocal'), 'error')
  }

  useEffect(() => {
    if (!user?.id) return
    let active = true
    setNotifications(readLocalPreferences(user.id, 'notification_preferences', DEFAULT_NOTIFICATION_PREFERENCES))
    setPrivacy(readLocalPreferences(user.id, 'privacy_preferences', DEFAULT_PRIVACY_PREFERENCES))
    supabase.from('user_preferences')
      .select('notification_preferences, privacy_preferences')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          showToast('Could not load saved settings. You can still change them on this device.', 'error')
          return
        }
        const savedNotifications = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data?.notification_preferences || {}) }
        const savedPrivacy = { ...DEFAULT_PRIVACY_PREFERENCES, ...(data?.privacy_preferences || {}) }
        setNotifications(savedNotifications)
        setPrivacy(savedPrivacy)
        localStorage.setItem(`prima_notification_preferences_${user.id}`, JSON.stringify(savedNotifications))
        localStorage.setItem(`prima_privacy_preferences_${user.id}`, JSON.stringify(savedPrivacy))
      })
    return () => { active = false }
  }, [user?.id])

  const toggle = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const togglePrivacy = (key) => {
    setPrivacy(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (user?.id) {
        const { error } = await supabase.from('user_preferences').upsert({
          user_id: user.id,
          notification_preferences: notifications,
          privacy_preferences: privacy,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        if (error) throw error
      }
      const storageId = user?.id || 'guest'
      localStorage.setItem(`prima_notification_preferences_${storageId}`, JSON.stringify(notifications))
      localStorage.setItem(`prima_privacy_preferences_${storageId}`, JSON.stringify(privacy))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      showToast(`Could not save settings: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const ToggleRow = ({ label, subLabel, settingKey, icon }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '14px 0',
      borderBottom: '1px solid var(--color-page)'
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <BrandIcon name={icon} size={34} active={notifications[settingKey]} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
            {label}
          </div>
          {subLabel && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '1px' }}>
              {subLabel}
            </div>
          )}
        </div>
      </div>
      <PreferenceSwitch
        label={label}
        checked={notifications[settingKey]}
        onChange={() => toggle(settingKey)}
        onLabel={st('on')}
        offLabel={st('off')}
      />
    </div>
  )

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '4px' }}>
        {t('settings')}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
        {st('description')}
      </div>

      {/* Prima Credits Card */}
      <div style={{
        background: 'var(--color-brand-gradient)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '14px', color: 'var(--color-surface)'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{
              fontSize: '12px', opacity: 0.8,
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: '4px'
            }}>{st('credits')}</div>
            <div style={{
              fontSize: '32px', fontWeight: '800',
              letterSpacing: '-1px', marginBottom: '3px'
            }}>
              {credits?.balance?.toFixed(0) || 0}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              ≈ ${((credits?.balance || 0) / CREDITS_PER_DOLLAR).toFixed(2)} value · {CREDITS_PER_DOLLAR} credits = $1
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>
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
              color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit'
            }}>🎁 Refer & Earn</button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '10px', padding: '9px',
              fontSize: '12px', fontWeight: '700',
              color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit'
            }}>💰 Commission</button>
        </div>
      </div>

      {/* Emergency Report */}
      <div style={{
        background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
        borderRadius: '16px', padding: '16px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-danger)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>Safety</div>
        <div
          onClick={() => setShowEmergency(true)}
          style={{ display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'var(--color-danger)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', flexShrink: 0
          }}>🆘</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-danger)', marginBottom: '2px' }}>
              Emergency Report
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-danger)', opacity: 0.8 }}>
              Report a serious incident to Prima and authorities
            </div>
          </div>
          <span style={{ color: 'var(--color-danger)', fontSize: '18px' }}>→</span>
        </div>
      </div>

      {/* Account */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>Account</div>
        <div style={{
          display: 'flex', gap: '12px', alignItems: 'center',
          padding: '4px 0'
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'var(--color-brand-soft)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: '800', color: 'var(--color-brand)'
          }}>
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text)' }}>
              {user?.email}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '2px' }}>
              {st('member')}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '4px'
        }}>{t('notifications')}</div>

        <ToggleRow
          icon="applied"
          label={st('applications')}
          subLabel={st('applicationsHelp')}
          settingKey="applications"
        />
        <ToggleRow
          icon="accepted"
          label={st('statusUpdates')}
          subLabel={st('statusHelp')}
          settingKey="statusUpdates"
        />
        <ToggleRow
          icon="chat"
          label={st('messages')}
          subLabel={st('messagesHelp')}
          settingKey="messages"
        />
        <ToggleRow
          icon="receipt"
          label={st('receipts')}
          subLabel={st('receiptsHelp')}
          settingKey="receipts"
        />
        <ToggleRow
          icon="reviews"
          label={st('reviews')}
          subLabel={st('reviewsHelp')}
          settingKey="reviews"
        />
        <ToggleRow
          icon="map"
          label={st('newGigs')}
          subLabel={st('newGigsHelp')}
          settingKey="newGigs"
        />
        <ToggleRow
          icon="sound"
          label={st('sounds')}
          subLabel={st('soundsHelp')}
          settingKey="sounds"
        />
      </div>

      {/* Privacy */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>{t('privacy')}</div>
        <div style={{
          fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5',
          marginBottom: '4px'
        }}>{st('privacyNotice')}</div>
        {[
          ['location', st('location'), st('locationHelp')],
          ['phone', st('phone'), st('phoneHelp')],
          ['profile', st('profile'), st('profileHelp')],
        ].map(([settingKey, label, sub]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '12px 0',
            borderBottom: '1px solid var(--color-page)'
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <BrandIcon name={settingKey} size={34} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
                  {label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '1px' }}>
                  {sub}
                </div>
              </div>
            </div>
            <PreferenceSwitch
              label={label}
              checked={privacy[settingKey]}
              onChange={() => togglePrivacy(settingKey)}
              onLabel={st('on')}
              offLabel={st('off')}
            />
          </div>
        ))}
      </div>

      {/* Language & Currency */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px', position: 'relative',
        zIndex: showLangPicker || showCurrencyPicker ? 20 : 0
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>{t('language')} & {t('currency')}</div>

        {/* Language selector */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '12px 0',
          borderBottom: '1px solid var(--color-page)',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>🌍</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
                {t('language')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{st('languageHelp')}</div>
            </div>
          </div>
          <button
            onClick={() => { setShowLangPicker(s => !s); setShowCurrencyPicker(false) }}
            style={{
              background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
              borderRadius: '10px', padding: '7px 12px',
              fontSize: '13px', fontWeight: '600', color: 'var(--color-text)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '7px'
            }}>
            <span>{SUPPORTED_LANGUAGES.find(l => l.code === language)?.flag}</span>
            <span>{SUPPORTED_LANGUAGES.find(l => l.code === language)?.native}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>▼</span>
          </button>

          {showLangPicker && (
            <div style={{
              position: 'absolute', top: '50px', right: 0,
              background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
              borderRadius: '14px', padding: '8px',
              zIndex: 100, minWidth: '220px',
              boxShadow: '0 8px 32px rgba(108,71,255,0.15)',
              maxHeight: '280px', overflowY: 'auto'
            }}>
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  style={{
                    width: '100%', border: 0, textAlign: 'left', fontFamily: 'inherit',
                    display: 'flex', gap: '10px', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '10px',
                    cursor: 'pointer',
                    background: language === lang.code ? 'var(--color-brand-soft)' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                  onMouseLeave={e => e.currentTarget.style.background =
                    language === lang.code ? 'var(--color-brand-soft)' : 'transparent'}
                >
                  <span style={{ fontSize: '20px' }}>{lang.flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: language === lang.code ? '700' : '500',
                      color: language === lang.code ? 'var(--color-brand)' : 'var(--color-text)'
                    }}>{lang.native}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{lang.name}</div>
                  </div>
                  {language === lang.code && (
                    <span style={{ color: 'var(--color-brand)', fontSize: '14px' }}>✓</span>
                  )}
                </button>
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
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
                {t('currency')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{st('currencyHelp')}</div>
            </div>
          </div>
          <button
            onClick={() => { setShowCurrencyPicker(s => !s); setShowLangPicker(false) }}
            style={{
              background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
              borderRadius: '10px', padding: '7px 12px',
              fontSize: '13px', fontWeight: '600', color: 'var(--color-text)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '7px'
            }}>
            <span>{CURRENCIES.find(c => c.code === currency)?.flag}</span>
            <span>{currency}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>▼</span>
          </button>

          {showCurrencyPicker && (
            <div style={{
              position: 'absolute', top: '50px', right: 0,
              background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
              borderRadius: '14px', padding: '8px',
              zIndex: 100, minWidth: '240px',
              boxShadow: '0 8px 32px rgba(108,71,255,0.15)',
              maxHeight: '280px', overflowY: 'auto'
            }}>
              {CURRENCIES.map(curr => (
                <button
                  type="button"
                  key={curr.code}
                  onClick={() => handleCurrencyChange(curr.code)}
                  style={{
                    width: '100%', border: 0, textAlign: 'left', fontFamily: 'inherit',
                    display: 'flex', gap: '10px', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '10px',
                    cursor: 'pointer',
                    background: currency === curr.code ? 'var(--color-brand-soft)' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                  onMouseLeave={e => e.currentTarget.style.background =
                    currency === curr.code ? 'var(--color-brand-soft)' : 'transparent'}
                >
                  <span style={{ fontSize: '20px' }}>{curr.flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: currency === curr.code ? '700' : '500',
                      color: currency === curr.code ? 'var(--color-brand)' : 'var(--color-text)'
                    }}>{curr.code} — {curr.symbol}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{curr.name}</div>
                  </div>
                  {currency === curr.code && (
                    <span style={{ color: 'var(--color-brand)', fontSize: '14px' }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legal */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '16px 18px',
        marginBottom: '14px', position: 'relative', zIndex: 0
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '4px'
        }}>{st('legal')}</div>

        {[
          { icon: '🔒', label: st('privacyPolicy'), sub: st('privacyHelp'), url: '/privacy' },
          { icon: '📄', label: st('terms'), sub: st('termsHelp'), url: '/terms' },
        ].map(({ icon, label, sub, url }, i, arr) => (
          <Link
            key={label}
            to={url}
            style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '13px 0',
              borderBottom: i < arr.length - 1 ? '1px solid var(--color-page)' : 'none',
              textDecoration: 'none'
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '10px',
                background: 'var(--color-page)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', flexShrink: 0
              }}>{icon}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
                  {label}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '1px' }}>
                  {sub}
                </div>
              </div>
            </div>
            <span style={{ color: 'var(--color-text-subtle)', fontSize: '16px' }}>›</span>
          </Link>
        ))}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          background: saved
            ? 'var(--color-success-soft)'
            : saving
              ? 'var(--color-brand-border-strong)'
              : 'var(--color-brand-gradient)',
          border: saved ? '1.5px solid var(--color-success-border)' : 'none',
          borderRadius: '12px', padding: '14px',
          fontSize: '14px', fontWeight: '700',
          color: saved ? 'var(--color-success)' : 'var(--color-surface)',
          cursor: saving ? 'not-allowed' : 'pointer',
          boxShadow: saved || saving ? 'none' : '0 4px 20px rgba(108,71,255,0.35)',
          fontFamily: 'inherit', marginBottom: '12px',
          transition: 'all 0.2s'
        }}>
        {saved ? `✓ ${t('saveSettings')}` : saving ? '⏳ Saving...' : t('saveSettings')}
      </button>

      {/* Logout */}
      <button onClick={onLogout} style={{
        width: '100%', background: 'var(--color-danger-soft)',
        border: '1.5px solid var(--color-danger-border)', borderRadius: '12px',
        padding: '14px', fontSize: '14px', fontWeight: '700',
        color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit'
      }}>{t('logout')}</button>

      {showEmergency && (
        <EmergencyReport onClose={() => setShowEmergency(false)} />
      )}
    </div>
  )
}
