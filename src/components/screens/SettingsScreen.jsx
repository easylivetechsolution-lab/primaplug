import { useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import BrandIcon from '../BrandIcon'

export default function SettingsScreen({ onLogout }) {
  const { user } = useAuth()
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
