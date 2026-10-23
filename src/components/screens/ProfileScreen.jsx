import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadToR2 } from '../../utils/r2upload'
import CategoryPicker from '../CategoryPicker'
import BrandIcon from '../BrandIcon'
import ScreenLoader from '../ScreenLoader'
import { completeReferral } from '../../utils/referral'
import { showToast } from '../../utils/toast'
import { getProfileCompletion, isReferralProfileComplete } from '../../utils/profileComplete'
import { parseTimestamp } from '../../utils/time'
import { useCredits } from '../../context/CreditsContext'
import { CREDITS_PER_DOLLAR } from '../../utils/payments'
import SelfieVerification from '../SelfieVerification'
import VerificationBadge from '../VerificationBadge'

const LEVELS = [
  { key: 'new', label: 'New Member', icon: 'profile', tone: 'linear-gradient(135deg,var(--color-text-muted),var(--color-text-subtle))', color: 'var(--color-text-muted)', bg: 'var(--color-page)', border: 'var(--color-border)', min: 0 },
  { key: 'rising', label: 'Rising', icon: 'stats', tone: 'linear-gradient(135deg,var(--color-warning),var(--color-brand-highlight))', color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', border: 'var(--color-warning-border)', min: 3 },
  { key: 'pro', label: 'Pro', icon: 'level', tone: 'var(--color-brand-gradient)', color: 'var(--color-brand)', bg: 'var(--color-brand-soft)', border: 'var(--color-brand-border-strong)', min: 10 },
  { key: 'elite', label: 'Elite', icon: 'rating', tone: 'linear-gradient(135deg,var(--color-warning-gold),var(--color-warning))', color: 'var(--color-warning-gold)', bg: 'var(--color-warning-gold-soft)', border: 'var(--color-warning-gold-border)', min: 25 },
]

const WX_STATUS = {
  completed: { color: 'var(--color-success)', bg: 'var(--color-success-soft)', label: 'Completed' },
  pending: { color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', label: 'Pending' },
  failed: { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)', label: 'Failed' },
}

// ─────────────────────────────────────────────
// LOCATION SEARCH (unchanged behavior, kept as-is)
// ─────────────────────────────────────────────
const LocationSearch = ({ value, onSelect, inputStyle }) => {
  const [search, setSearch] = useState(value || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(!!value)

  const handleSearch = async (val) => {
    setSearch(val)
    setSelected(false)
    onSelect('')
    if (val.length < 3) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      setResults(data)
    } catch (e) { console.log(e) }
    setLoading(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inputStyle, paddingRight: '36px' }}
          placeholder="Search your city or area..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <span style={{
          position: 'absolute', right: '12px',
          top: '50%', transform: 'translateY(-50%)',
          fontSize: '14px',
          color: selected ? 'var(--color-success)' : 'var(--color-text-subtle)'
        }}>
          {loading ? '⏳' : selected ? '✓' : <BrandIcon name="search" size={24} />}
        </span>
      </div>
      {results.length > 0 && !selected && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--color-surface)', border: '1.5px solid var(--color-brand-border-strong)',
          borderRadius: '12px', marginTop: '4px',
          zIndex: 100, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(108,71,255,0.15)'
        }}>
          {results.map((r, i) => {
            const city = r.address?.city || r.address?.town || r.address?.village || ''
            const country = r.address?.country || ''
            const state = r.address?.state || ''
            const name = [city, state, country].filter(Boolean).join(', ')
            return (
              <div key={i}
                onClick={() => {
                  setSearch(name)
                  setResults([])
                  setSelected(true)
                  onSelect(name)
                }}
                style={{
                  padding: '11px 14px', cursor: 'pointer',
                  borderBottom: i < results.length - 1 ? '1px solid var(--color-page)' : 'none',
                  display: 'flex', gap: '8px', alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
              >
                <BrandIcon name="location" size={28} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)' }}>
                    {name || r.display_name.split(',')[0]}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    {r.display_name.length > 50 ? r.display_name.substring(0, 50) + '...' : r.display_name}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ANIMATED AVATAR RING - the one signature motion piece
// ─────────────────────────────────────────────
const AvatarRing = ({ size = 96, avatarUrl, initial, onAvatarClick, uploading, ringColor = 'var(--color-success-accent)' }) => {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedScore / 100) * circumference

  useEffect(() => {
    const t = setTimeout(() => setAnimatedScore(100), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={ringColor} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1), stroke 0.4s' }}
        />
      </svg>
      <div
        onClick={onAvatarClick}
        style={{
          position: 'absolute', top: '6px', left: '6px',
          width: size - 12, height: size - 12, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', overflow: 'hidden',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center'
        }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: size * 0.32, fontWeight: '800', color: 'var(--color-surface)', lineHeight: 1 }}>
              {initial || '?'}
            </span>
            {uploading && <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>Uploading...</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PROGRESS BAR — reusable, used for completion + skill-level style bars
// ─────────────────────────────────────────────
const ProgressBar = ({ value, max = 100, color = 'var(--color-brand)', bg = 'var(--color-border)', height = 6, animateDelay = 0 }) => {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(100, (value / max) * 100)), 150 + animateDelay)
    return () => clearTimeout(t)
  }, [value, max, animateDelay])
  return (
    <div style={{ height, background: bg, borderRadius: height, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${width}%`, borderRadius: height,
        background: color, transition: 'width 0.9s cubic-bezier(0.16,1,0.3,1)'
      }} />
    </div>
  )
}

// ─────────────────────────────────────────────
// STAT CARD — used in the metrics strip
// ─────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = 'var(--color-brand)', bg = 'var(--color-brand-soft)' }) => (
  <div style={{
    background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
    borderRadius: '16px', padding: '16px',
    display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0
  }}>
    <div style={{
      width: '34px', height: '34px', borderRadius: '10px',
      background: bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '600', marginTop: '2px' }}>{label}</div>
      {sub && <div style={{ fontSize: '12px', color, fontWeight: '700', marginTop: '3px' }}>{sub}</div>}
    </div>
  </div>
)

// ─────────────────────────────────────────────
// COMING SOON CARD — finished-looking placeholder for upcoming features
// ─────────────────────────────────────────────
const ProfileToneIcon = ({ name, tone, size = 34 }) => (
  <BrandIcon name={name} size={size} active={true} tone={tone} />
)

const ComingSoonCard = ({ icon, title, desc, gradient }) => (
  <div style={{
    background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
    borderRadius: '16px', padding: '16px',
    display: 'flex', gap: '12px', alignItems: 'center',
    position: 'relative', overflow: 'hidden'
  }}>
    <div style={{
      width: '42px', height: '42px', borderRadius: '12px',
      background: gradient, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '20px', flexShrink: 0
    }}>{typeof icon === 'string' ? <ProfileToneIcon name={icon} tone={gradient} size={34} /> : icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '2px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', lineHeight: '1.4' }}>{desc}</div>
    </div>
    <span style={{
      fontSize: '12px', fontWeight: '800', color: 'var(--color-text-subtle)',
      background: 'var(--color-page)', border: '1px solid var(--color-border)',
      borderRadius: '6px', padding: '4px 8px', flexShrink: 0,
      textTransform: 'uppercase', letterSpacing: '0.4px'
    }}>Soon</span>
  </div>
)

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
export default function ProfileScreen({ onLogout }) {
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuth()
  const { credits, hasUnpaidCommissions, totalOwed, pendingCommissions } = useCredits()
  const isOwnProfile = true
  const [profile, setProfile] = useState(null)
  const [profileStats, setProfileStats] = useState({
    totalEarned: 0,
    totalReviews: 0,
  })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('physical')
  const [editForm, setEditForm] = useState({})
  const [activeTab, setActiveTab] = useState('about')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showSelfie, setShowSelfie] = useState(false)
  const [withdrawalHistory, setWithdrawalHistory] = useState([])
  const [profileWallets, setProfileWallets] = useState([])
  const fileRef = useRef()

  useEffect(() => { fetchProfile() }, [user])

  useEffect(() => {
    if (profile) {
      const { needsSelfie, reverificationRequired } = getProfileCompletion(profile)
      if (needsSelfie || reverificationRequired) {
        setTimeout(() => setShowSelfie(true), 2000)
      }
    }
  }, [profile])

  const fetchProfile = async () => {
    if (!user) return
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    const [{ data: reviews }, { data: receipts }, { data: withdrawals }, { data: walletsData }] = await Promise.all([
      supabase
        .from('reviews')
        .select('rating')
        .eq('reviewee_id', user.id),
      supabase
        .from('receipts')
        .select('amount')
        .eq('worker_id', user.id)
        .eq('completed', true),
      supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'withdrawal')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at'),
    ])

    const totalEarned = receipts?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0

    setProfileStats({
      totalEarned,
      totalReviews: reviews?.length || 0,
    })
    setWithdrawalHistory(withdrawals || [])
    setProfileWallets(walletsData || [])

    if (data) {
      setProfile(data)
      setEditForm(data)
    }
    setLoading(false)
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingAvatar(true)

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}.${fileExt}`

    let avatarUrl
    try {
      avatarUrl = await uploadToR2(file, 'avatars')
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error')
      setUploadingAvatar(false)
      return
    }

    await supabase.from('users').upsert({ id: user.id, avatar_url: avatarUrl })
    await fetchProfile()
    setUploadingAvatar(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        full_name: editForm.full_name,
        username: editForm.username,
        phone: editForm.phone,
        location: editForm.location,
        bio: editForm.bio,
        work_experience: editForm.work_experience,
        physical_mode: editForm.physical_mode,
        digital_mode: editForm.digital_mode,
        skills: editForm.skills || [],
        portfolio_url: editForm.portfolio_url,
        social_linkedin: editForm.social_linkedin,
        social_twitter: editForm.social_twitter,
      })
      .select()

    if (error) {
      showToast('Error saving: ' + error.message, 'error')
      setSaving(false)
      return
    }

    const updatedProfile = data?.[0]
    if (updatedProfile) {
      if (isReferralProfileComplete(updatedProfile)) await completeReferral()
    }

    await fetchProfile()
    refreshProfile()
    setEditing(false)
    setSaving(false)
  }

  const toggleSkill = (skill) => {
    const current = editForm.skills || []
    setEditForm(f => ({
      ...f,
      skills: current.includes(skill) ? current.filter(s => s !== skill) : [...current, skill]
    }))
  }

  const inputStyle = {
    width: '100%', background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
    borderRadius: '10px', padding: '11px 14px', fontSize: '13px',
    color: 'var(--color-text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box'
  }

  const labelStyle = {
    fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.8px',
    display: 'block', marginBottom: '6px'
  }

  if (loading) return <ScreenLoader />

  const { score: completionScore } = getProfileCompletion(profile || {})
  const gigsCompleted = profile?.gigs_completed || 0
  const nextLevelTarget = Math.max(10, Math.ceil((gigsCompleted + 1) / 10) * 10)

  // Level from gigs completed
  const currentLevel = LEVELS.reduce((acc, lvl) => gigsCompleted >= lvl.min ? lvl : acc, LEVELS[0])
  const nextLevelItem = LEVELS[LEVELS.indexOf(currentLevel) + 1] || null
  const levelProgress = nextLevelItem
    ? Math.min(100, Math.round(((gigsCompleted - currentLevel.min) / (nextLevelItem.min - currentLevel.min)) * 100))
    : 100
  const totalEarned = Number(profileStats.totalEarned || 0)
  const reviewsCount = Number(profileStats.totalReviews || 0)
  const nextEarnedTarget = Math.max(100, Math.ceil((totalEarned + 1) / 100) * 100)
  const nextReviewTarget = Math.max(10, Math.ceil((reviewsCount + 1) / 10) * 10)
  const progressMetrics = [
    { label: 'Total Earned', value: `$${totalEarned.toLocaleString()}`, current: totalEarned, max: nextEarnedTarget, color: 'linear-gradient(90deg,var(--color-success),#06D6D6)' },
    { label: 'Gigs Completed', value: gigsCompleted, current: gigsCompleted, max: nextLevelTarget, color: 'linear-gradient(90deg,var(--color-brand),var(--color-info))' },
    { label: 'Reviews', value: `${reviewsCount}/${nextReviewTarget}`, current: reviewsCount, max: nextReviewTarget, color: 'linear-gradient(90deg,var(--color-brand-highlight),var(--color-brand-mid))' },
  ]

  const isMobile = window.innerWidth < 768

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      maxWidth: '1180px',
      margin: '0 auto'
    }}>
      {/* EDIT MODAL */}
      {editing && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(20,18,58,0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 400,
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '20px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch'
  }}>
          <div style={{
  background: 'var(--color-surface)',
  borderRadius: '24px', padding: '28px',
  width: '100%', maxWidth: '520px',
  margin: '20px 0',
  border: '1.5px solid var(--color-border)',
  boxShadow: '0 20px 60px rgba(108,71,255,0.25)'
}}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '22px 22px 16px',
              borderBottom: '1px solid var(--color-page)', flexShrink: 0
            }}>
              <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text)' }}>Edit Profile</div>
              <button  onClick={() => setEditing(false)} style={{
                background: 'var(--color-page)', border: '1.5px solid var(--color-border)', borderRadius: '8px',
                width: '34px', height: '34px', fontSize: '18px', color: 'var(--color-text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
              }}>×</button>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: '14px',
              flex: 1, minHeight: 0, overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '18px 22px 22px'
            }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input style={inputStyle} value={editForm.full_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Username</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-subtle)', fontSize: '14px' }}>@</span>
                  <input style={{ ...inputStyle, paddingLeft: '28px' }} value={editForm.username || ''}
                    onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={editForm.phone || ''} placeholder="+1 400 000 0000"
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <LocationSearch value={editForm.location || ''} onSelect={(name) => setEditForm(f => ({ ...f, location: name }))} inputStyle={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Bio</label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={editForm.bio || ''}
                  placeholder="Tell people what you do..." onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Work Experience</label>
                <textarea style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} value={editForm.work_experience || ''}
                  placeholder="Describe your experience..." onChange={e => setEditForm(f => ({ ...f, work_experience: e.target.value }))} />
              </div>

              <div>
                <label style={labelStyle}>Work Modes</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { key: 'physical_mode', icon: 'physical', label: 'Physical', color: 'var(--color-warning)', bg: 'var(--color-warning-soft)', border: 'var(--color-warning-border)' },
                    { key: 'digital_mode', icon: 'digital', label: 'Digital', color: 'var(--color-brand)', bg: 'var(--color-brand-soft)', border: 'var(--color-brand-border-strong)' }
                  ].map(m => (
                    <div key={m.key} onClick={() => setEditForm(f => ({ ...f, [m.key]: !f[m.key] }))} style={{
                      flex: 1, background: editForm[m.key] ? m.bg : 'var(--color-page)',
                      border: `1.5px solid ${editForm[m.key] ? m.border : 'var(--color-border)'}`,
                      borderRadius: '12px', padding: '14px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                        <BrandIcon name={m.icon} size={40} active={!!editForm[m.key]} />
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: editForm[m.key] ? m.color : 'var(--color-text-muted)' }}>{m.label}</div>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: editForm[m.key] ? m.color : 'var(--color-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '8px auto 0', transition: 'all 0.2s'
                      }}>
                        {editForm[m.key] && <span style={{ color: 'var(--color-surface)', fontSize: '12px', fontWeight: '700' }}>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Skills</label>
                <CategoryPicker
                  selected={(editForm.skills || [])[0] || ''}
                  onSelect={(field) => {
                    if (!field) { setEditForm(f => ({ ...f, skills: [] })); return }
                    const current = editForm.skills || []
                    if (!current.includes(field)) setEditForm(f => ({ ...f, skills: [field, ...current] }))
                  }}
                  customSkill={editForm.custom_skill || ''}
                  onCustomSkill={(val) => setEditForm(f => ({ ...f, custom_skill: val }))}
                />
                {editForm.skills && editForm.skills.length > 0 && (
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {editForm.skills.map((skill, i) => (
                      <span key={i} style={{
                        background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)', borderRadius: '20px',
                        padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--color-brand)',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        {skill}
                        <span onClick={() => setEditForm(f => ({ ...f, skills: f.skills.filter((_, j) => j !== i) }))}
                          style={{ cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-subtle)', lineHeight: 1 }}>×</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Portfolio URL</label>
                <input style={inputStyle} value={editForm.portfolio_url || ''} placeholder="https://yourportfolio.com"
                  onChange={e => setEditForm(f => ({ ...f, portfolio_url: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>LinkedIn</label>
                <input style={inputStyle} value={editForm.social_linkedin || ''} placeholder="linkedin.com/in/yourname"
                  onChange={e => setEditForm(f => ({ ...f, social_linkedin: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Twitter / X</label>
                <input style={inputStyle} value={editForm.social_twitter || ''} placeholder="twitter.com/yourname"
                  onChange={e => setEditForm(f => ({ ...f, social_twitter: e.target.value }))} />
              </div>
            </div>

            <div style={{
              display: 'flex', gap: '10px',
              padding: '14px 22px calc(14px + env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--color-page)',
              background: 'var(--color-surface)',
              boxShadow: '0 -10px 24px rgba(20,18,58,0.06)',
              flexShrink: 0
            }}>
              <button onClick={() => { document.activeElement?.blur(); setEditForm(profile); setEditing(false) }} disabled={saving} style={{
                flex: 1, background: 'var(--color-page)', border: '1.5px solid var(--color-border)', borderRadius: '12px',
                padding: '13px', fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit'
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, background: saving ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
                border: 'none', borderRadius: '12px', padding: '13px', fontSize: '14px', fontWeight: '700',
                color: 'var(--color-surface)', cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(108,71,255,0.3)', fontFamily: 'inherit'
              }}>{saving ? '⏳ Saving...' : '✓ Save Profile'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          DASHBOARD GRID — sidebar + main
      ═══════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 320px) 1fr',
        gap: '20px',
        alignItems: 'start'
      }} className="profile-dashboard-grid">

        {/* ═══════════ LEFT RAIL ═══════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '20px' }} className="profile-sidebar">

          {/* IDENTITY CARD */}
          <div style={{
            background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
            borderRadius: '24px', padding: '24px', color: 'var(--color-surface)', position: 'relative'
          }}>
            <button onClick={() => setEditing(true)} style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.3)',
              borderRadius: '10px', padding: '7px 12px', fontSize: '12px', fontWeight: '700',
              color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '5px'
            }}>
              <BrandIcon name="edit" size={20} /> Edit
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '16px' }}>
              <AvatarRing
                avatarUrl={profile?.avatar_url}
                initial={profile?.full_name?.charAt(0)?.toUpperCase()}
                onAvatarClick={() => fileRef.current.click()}
                uploading={uploadingAvatar}
                ringColor="var(--color-success-accent)"
              />
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

              <div style={{ fontSize: '19px', fontWeight: '800', marginTop: '12px' }}>
                {profile?.full_name || 'Your Name'}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>@{profile?.username || 'username'}</div>
              {profile?.location && (
                <div style={{ fontSize: '12px', opacity: 0.75, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <BrandIcon name="location" size={18} /> {profile.location}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                {profile?.is_verified && <VerificationBadge onDark />}
                <button
                  onClick={() => navigate(`/profile/${encodeURIComponent(user.id)}`, { state: { from: '/dashboard?screen=profile' } })}
                  style={{
                    minHeight: '34px', padding: '7px 11px', flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.9)', borderRadius: '10px',
                    background: 'var(--color-surface)', color: 'var(--color-brand)',
                    boxShadow: '0 3px 10px rgba(30,27,75,0.16)',
                    fontFamily: 'inherit', fontSize: '12px', fontWeight: '800', cursor: 'pointer'
                  }}
                >View public profile ↗</button>
              </div>
            </div>

            {profile?.bio && (
              <div style={{
                background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 14px',
                fontSize: '12px', lineHeight: '1.6', marginBottom: '16px'
              }}>{profile.bio}</div>
            )}

            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '4px', display: 'flex' }}>
              {['physical', 'digital'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, background: mode === m ? 'rgba(255,255,255,0.25)' : 'transparent',
                  border: 'none', borderRadius: '9px', padding: '9px 0', fontSize: '12px', fontWeight: '700',
                  color: mode === m ? 'var(--color-surface)' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s'
                }}>
                  <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '5px' }}>
                    <BrandIcon name={m === 'physical' ? 'physical' : 'digital'} size={18} active={mode === m} />
                  </span>
                  {m === 'physical' ? 'Physical' : 'Digital'}
                </button>
              ))}
            </div>

          </div>

          {/* PROFILE COMPLETION */}
          {completionScore < 100 && (
            <div onClick={() => setEditing(true)} style={{
              background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: '16px',
              padding: '16px', cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text)' }}>Profile Strength</span>
                <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-brand)' }}>{completionScore}%</span>
              </div>
              <ProgressBar value={completionScore} color="linear-gradient(90deg, var(--color-brand), var(--color-brand-mid))" />
              <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '6px' }}>Complete your profile to unlock more gigs →</div>
            </div>
          )}

          {/* FINANCIAL MINI-CARDS */}
          {isOwnProfile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {isMobile ? (
                <>
                  {/* Mobile row: Wallet + Commission side by side */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div
                      onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'wallet' }))}
                      style={{
                        flex: 1, background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))',
                        borderRadius: '14px', padding: '14px', color: 'var(--color-surface)', cursor: 'pointer'
                      }}>
                      <div style={{ fontSize: '12px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '700' }}>Wallet</div>
                      <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '4px' }}>
                        {profileWallets.length > 0 ? profileWallets.map(w => `${w.currency} ${Number(w.balance || 0).toLocaleString()}`).join(' · ') : '—'}
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>Tap to fund →</div>
                    </div>
                    <div
                      onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))}
                      style={{
                        flex: 1, background: hasUnpaidCommissions ? 'var(--color-danger-soft)' : 'var(--color-success-soft)',
                        border: `1.5px solid ${hasUnpaidCommissions ? 'var(--color-danger-border)' : 'var(--color-success-border)'}`,
                        borderRadius: '14px', padding: '14px', cursor: 'pointer'
                      }}>
                      <div style={{ fontSize: '12px', color: hasUnpaidCommissions ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Commission</div>
                      {hasUnpaidCommissions ? (
                        <>
                          <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-danger)' }}>${totalOwed.toFixed(2)}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-danger)', opacity: 0.85, marginTop: '4px' }}>{pendingCommissions.length} pending →</div>
                        </>
                      ) : (
                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-success)' }}>✓ Clear</div>
                      )}
                    </div>
                  </div>

                  {/* Mobile: Prima Credits — navigates to withdrawal */}
                  <div
                    onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'withdrawal' }))}
                    style={{
                      background: 'var(--color-brand-gradient)', borderRadius: '14px',
                      padding: '14px', color: 'var(--color-surface)', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                    <div>
                      <div style={{ fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Prima Credits</div>
                      <div style={{ fontSize: '20px', fontWeight: '800', marginBottom: '2px' }}>{credits?.balance?.toFixed(0) || 0}</div>
                      <div style={{ fontSize: '12px', opacity: 0.7 }}>≈ ${((credits?.balance || 0) / CREDITS_PER_DOLLAR).toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '700', opacity: 0.85 }}>Withdraw →</div>
                  </div>

                  {/* Mobile: Level progress card — shown here, hidden in main content */}
                  <div style={{
                    background: currentLevel.bg, border: `1.5px solid ${currentLevel.border}`,
                    borderRadius: '20px', padding: '20px 16px',
                    display: 'flex', gap: '16px', alignItems: 'stretch'
                  }}>
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      borderRight: `1.5px solid ${currentLevel.border}`,
                      paddingRight: '16px', gap: '8px'
                    }}>
                      <ProfileToneIcon name={currentLevel.icon} tone={currentLevel.tone} size={36} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: currentLevel.color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Current Level</div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text)' }}>{currentLevel.label}</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'stats' })) }}
                        style={{
                          background: currentLevel.tone, border: 'none', borderRadius: '8px',
                          padding: '7px 14px', fontSize: '12px', fontWeight: '700',
                          color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit'
                        }}>Stats →</button>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' }}>
                      {nextLevelItem ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: '600' }}>Next:</span>
                            <ProfileToneIcon name={nextLevelItem.icon} tone={nextLevelItem.tone} size={28} />
                            <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text)' }}>{nextLevelItem.label}</span>
                          </div>
                          <ProgressBar value={levelProgress} max={100} color={currentLevel.color} bg="rgba(255,255,255,0.6)" height={9} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                              {nextLevelItem.min - gigsCompleted > 0 ? `${nextLevelItem.min - gigsCompleted} gigs to go` : 'Ready!'}
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: '800', color: currentLevel.color }}>{levelProgress}%</div>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <ProfileToneIcon name="rating" tone="linear-gradient(135deg,var(--color-warning-gold),var(--color-warning))" size={44} />
                          <div style={{ fontSize: '13px', color: currentLevel.color, fontWeight: '700', marginTop: '6px' }}>Max level!</div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Desktop: stacked full-width */}
                  <div style={{
                    background: 'linear-gradient(135deg, var(--color-success-accent), var(--color-success))', borderRadius: '16px',
                    padding: '14px', color: 'var(--color-surface)'
                  }}>
                    <div style={{ fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Wallet</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>
                      {profileWallets.length > 0 ? profileWallets.map(w => `${w.currency} ${Number(w.balance || 0).toLocaleString()}`).join(' · ') : '—'}
                    </div>
                    <button onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'wallet' }))} style={{
                      background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)',
                      borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '700',
                      color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', width: '100%'
                    }}>Open Wallet</button>
                  </div>

                  <div
                    onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'withdrawal' }))}
                    style={{
                      background: 'var(--color-brand-gradient)', borderRadius: '16px',
                      padding: '14px', color: 'var(--color-surface)', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                    <div>
                      <div style={{ fontSize: '12px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Prima Credits</div>
                      <div style={{ fontSize: '20px', fontWeight: '800', marginBottom: '2px' }}>{credits?.balance?.toFixed(0) || 0}</div>
                      <div style={{ fontSize: '12px', opacity: 0.7 }}>≈ ${((credits?.balance || 0) / CREDITS_PER_DOLLAR).toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '700', opacity: 0.85 }}>Withdraw →</div>
                  </div>

                  <div onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'commission' }))} style={{
                    background: hasUnpaidCommissions ? 'var(--color-danger-soft)' : 'var(--color-success-soft)',
                    border: `1.5px solid ${hasUnpaidCommissions ? 'var(--color-danger-border)' : 'var(--color-success-border)'}`,
                    borderRadius: '16px', padding: '14px', cursor: 'pointer'
                  }}>
                    <div style={{ fontSize: '12px', color: hasUnpaidCommissions ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                      Commission
                    </div>
                    {hasUnpaidCommissions ? (
                      <>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-danger)' }}>${totalOwed.toFixed(2)}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-danger)', opacity: 0.8 }}>{pendingCommissions.length} pending — pay now →</div>
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-success)' }}>✓ All clear</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* REFER & EARN */}
          <div onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'referral' }))} style={{
            background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 55%, var(--color-brand-highlight) 100%)',
            borderRadius: '16px', padding: '14px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '20px', flexShrink: 0
            }}>
              <ProfileToneIcon name="commission" tone="rgba(255,255,255,0.24)" size={32} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-surface)', marginBottom: '2px' }}>Refer & Earn</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>5% of friends' first gig earnings</div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>→</span>
          </div>

          {/* VERIFICATION PROMPTS */}
          {!profile?.selfie_verified && (
            <div onClick={() => setShowSelfie(true)} style={{
              background: 'linear-gradient(135deg, var(--color-warning), var(--color-brand-highlight))', borderRadius: '16px', padding: '14px',
              cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center'
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0
              }}>
                <ProfileToneIcon name="camera" tone="rgba(255,255,255,0.24)" size={32} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-surface)' }}>Verify Yourself</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>Required to post & apply</div>
              </div>
            </div>
          )}

          {profile?.reverification_required && (
            <div onClick={() => setShowSelfie(true)} style={{
              background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)', borderRadius: '16px', padding: '14px',
              cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center'
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-danger-soft)',
                border: '1.5px solid var(--color-danger-border)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '20px', flexShrink: 0
              }}>
                <ProfileToneIcon name="level" tone="linear-gradient(135deg, var(--color-danger), var(--color-warning))" size={32} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-danger)' }}>Re-verification Needed</div>
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', opacity: 0.8 }}>Take a new selfie</div>
              </div>
            </div>
          )}

          {!isMobile && (
            <button onClick={onLogout} style={{
              width: '100%', background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)', borderRadius: '12px',
              padding: '13px', fontSize: '13px', fontWeight: '700', color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit'
            }}>Log Out of Prima</button>
          )}
        </div>

        {/* ═══════════ MAIN CONTENT ═══════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          {/* METRICS STRIP — hidden on mobile */}
          {!isMobile && <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px',
            order: 1
          }}>
            <StatCard icon={<ProfileToneIcon name="rating" tone="linear-gradient(135deg, var(--color-warning-gold), var(--color-warning))" size={30} />} label="Rating" value={reviewsCount > 0 ? `${Number(profile?.rating || 0).toFixed(1)}` : '0.0'} color="var(--color-warning-gold)" bg="var(--color-warning-gold-soft)" />
            <StatCard icon={<ProfileToneIcon name="completed" tone="linear-gradient(135deg, var(--color-success-accent), var(--color-success))" size={30} />} label="Gigs Done" value={gigsCompleted} sub={`${nextLevelTarget - gigsCompleted} to next level`} color="var(--color-success)" bg="var(--color-success-soft)" />
            <StatCard icon={<ProfileToneIcon name="reviews" tone="var(--color-brand-gradient)" size={30} />} label="Reviews" value={reviewsCount} color="var(--color-brand)" bg="var(--color-brand-soft)" />
            <StatCard icon={<ProfileToneIcon name="open" tone="linear-gradient(135deg, var(--color-warning), var(--color-brand-highlight))" size={30} />} label="Response" value={(profile?.response_time || '1h').replace(/^<\s*/, '')} color="var(--color-warning)" bg="var(--color-warning-soft)" />
          </div>}

          {/* LEVEL PROGRESS CARD — desktop only; on mobile it appears in the sidebar after credits */}
          {!isMobile && <div style={{
            background: currentLevel.bg, border: `1.5px solid ${currentLevel.border}`,
            borderRadius: '20px', padding: '22px 20px',
            display: 'flex', gap: '20px', alignItems: 'stretch',
            order: 4
          }}>
            {/* Left half — current level badge */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              borderRight: `1.5px solid ${currentLevel.border}`,
              paddingRight: '20px', gap: '10px'
            }}>
              <ProfileToneIcon name={currentLevel.icon} tone={currentLevel.tone} size={36} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: currentLevel.color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Current Level</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text)' }}>{currentLevel.label}</div>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'stats' }))}
                style={{
                  background: currentLevel.tone, border: 'none', borderRadius: '10px',
                  padding: '8px 16px', fontSize: '12px', fontWeight: '700',
                  color: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit'
                }}>Stats →</button>
            </div>

            {/* Right half — progress to next level */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
              {nextLevelItem ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: '600' }}>Next:</span>
                    <ProfileToneIcon name={nextLevelItem.icon} tone={nextLevelItem.tone} size={32} />
                    <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text)' }}>{nextLevelItem.label}</span>
                  </div>
                  <ProgressBar value={levelProgress} max={100} color={currentLevel.color} bg="rgba(255,255,255,0.6)" height={10} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                      {nextLevelItem.min - gigsCompleted > 0
                        ? `${nextLevelItem.min - gigsCompleted} gigs to go`
                        : 'Ready to level up!'}
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: '800', color: currentLevel.color }}>{levelProgress}%</div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <ProfileToneIcon name="rating" tone="linear-gradient(135deg,var(--color-warning-gold),var(--color-warning))" size={52} />
                  <div style={{ fontSize: '14px', color: currentLevel.color, fontWeight: '700', marginTop: '8px' }}>
                    Max level reached!
                  </div>
                </div>
              )}
            </div>
          </div>}

          {/* PROGRESS OVERVIEW — compact 2-col */}
          <div style={{
            background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
            borderRadius: '16px', padding: '14px 16px',
            maxWidth: isMobile ? '100%' : '50%',
            order: 5
          }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Progress</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {progressMetrics.map((metric, index) => (
                <div key={metric.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>{metric.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text)' }}>{metric.value}</span>
                  </div>
                  <ProgressBar value={metric.current} max={metric.max} color={metric.color} bg="var(--color-border)" height={5} animateDelay={index * 60} />
                </div>
              ))}
            </div>
          </div>

          {/* TABS */}
          <div style={{
            display: 'flex', gap: '4px', background: 'var(--color-surface)', borderRadius: '14px',
            padding: '4px', border: '1.5px solid var(--color-border)', overflowX: 'auto',
            order: 2
          }}>
            {['about', 'skills', 'experience', 'activity', 'links'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, minWidth: '80px', background: activeTab === tab ? 'var(--color-brand)' : 'transparent',
                border: 'none', borderRadius: '10px', padding: '9px 4px', fontSize: '12px',
                fontWeight: activeTab === tab ? '700' : '500', color: activeTab === tab ? 'var(--color-surface)' : 'var(--color-text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', textTransform: 'capitalize'
              }}>{tab}</button>
            ))}
          </div>

          {/* TAB CONTENT */}
          <div style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: '16px', padding: '20px', order: 3 }}>

            {activeTab === 'about' && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>About</div>
                {profile?.bio ? (
                  <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.7', marginBottom: '16px' }}>{profile.bio}</p>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--color-text-subtle)', marginBottom: '16px' }}>No bio yet. Click Edit to add one.</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                  {[
                    ['location', 'Location', profile?.location || 'Not set'],
                    ['notifications', 'Email', user?.email || '—'],
                    ['phone', 'Phone', profile?.phone || 'Not set'],
                    ['open', 'Response', (profile?.response_time || '1 hour').replace(/^<\s*/, '')],
                    ['completed', 'Joined', profile?.joined_at ? parseTimestamp(profile.joined_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'],
                    ['accepted', 'Status', profile?.is_available ? 'Available' : 'Busy'],
                  ].map(([icon, key, val]) => (
                    <div key={key} style={{ background: 'var(--color-page)', borderRadius: '10px', padding: '10px 12px', minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginBottom: '7px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BrandIcon name={icon} size={28} active={false} />{key}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.35 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'skills' && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                  <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}>
                    <BrandIcon name={mode === 'physical' ? 'physical' : 'digital'} size={22} />
                  </span>
                  {mode === 'physical' ? 'Physical Skills' : 'Digital Skills'}
                </div>
                {profile?.skills && profile.skills.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {profile.skills.map(skill => (
                      <span key={skill} style={{
                        background: mode === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)',
                        border: `1.5px solid ${mode === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)'}`,
                        borderRadius: '20px', padding: '7px 14px', fontSize: '13px', fontWeight: '600',
                        color: mode === 'physical' ? 'var(--color-warning)' : 'var(--color-brand)'
                      }}>{skill}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>No skills added yet. Click Edit to add your skills.</div>
                )}
                <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--color-page)', borderRadius: '10px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                  Toggle between Physical and Digital mode above to see how your skills appear to different clients.
                </div>
              </div>
            )}

            {activeTab === 'experience' && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Work Experience</div>
                {profile?.work_experience ? (
                  <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{profile.work_experience}</p>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>No experience added yet. Click Edit to describe your background.</div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>This Month</div>
                {[
                  ['Total Earned', `$${totalEarned}`, 'var(--color-success)'],
                  ['Gigs Completed', gigsCompleted, 'var(--color-text)'],
                  ['Avg. Rating', reviewsCount > 0 ? `${Number(profile?.rating || 0).toFixed(1)}` : '0.0', 'var(--color-warning-gold)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: '1px solid var(--color-border)'
                  }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color }}>{val}</span>
                  </div>
                ))}

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <ComingSoonCard
                    icon="stats" title="Full Analytics Dashboard"
                    desc="Earnings trends, gig performance, and conversion rates over time."
                    gradient="var(--color-brand-gradient)"
                  />
                  <ComingSoonCard
                    icon="receipt" title="Activity Log"
                    desc="A complete timeline of every action on your account."
                    gradient="linear-gradient(135deg, var(--color-success-accent), var(--color-success))"
                  />
                </div>
              </div>
            )}

            {activeTab === 'links' && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Links & Portfolio</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    ['portfolio', 'Portfolio', profile?.portfolio_url],
                    ['linkedin', 'LinkedIn', profile?.social_linkedin],
                    ['twitter', 'Twitter / X', profile?.social_twitter],
                  ].map(([icon, label, url]) => (
                    <div key={label} style={{
                      background: 'var(--color-page)', borderRadius: '10px', padding: '12px 14px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: '600' }}>
                        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '8px' }}>
                          <BrandIcon name={icon} size={28} />
                        </span>{label}
                      </span>
                      {url ? (
                        <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: '12px', color: 'var(--color-brand)', fontWeight: '600', textDecoration: 'none' }}>Visit →</a>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>Not set</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* VERIFICATION BANNER */}
          {!profile?.is_verified && (
            <div style={{
              background: 'linear-gradient(135deg, var(--color-warning-gold-soft), var(--color-warning-soft))', border: '1.5px solid var(--color-warning-border)',
              borderRadius: '16px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center',
              order: 6
            }}>
              <BrandIcon name="level" size={42} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '3px' }}>Get Verified on Prima</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>Verified users get 3x more gig responses. Show clients you're legit.</div>
              </div>
              <button style={{
                background: 'linear-gradient(135deg, var(--color-warning-gold), var(--color-warning))', border: 'none', borderRadius: '10px',
                padding: '9px 14px', fontSize: '12px', fontWeight: '700', color: 'var(--color-surface)', cursor: 'pointer',
                fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap'
              }}>Get Verified</button>
            </div>
          )}

          {/* COMING SOON SECTION */}
          <div style={{ order: 7 }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
              Coming to Prima
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
              <ComingSoonCard
                icon="accepted" title="Prima Pro"
                desc="Priority placement, lower commission, and advanced tools for power users."
                gradient="linear-gradient(135deg, var(--color-warning-gold), var(--color-warning))"
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .profile-dashboard-grid {
            grid-template-columns: 1fr !important;
          }
          .profile-sidebar {
            position: static !important;
          }
        }
      `}</style>

      {/* Mobile logout — shown only on mobile via JS, not CSS */}
      {isMobile && (
        <div style={{ marginTop: '16px', paddingBottom: '8px' }}>
          <button onClick={onLogout} style={{
            width: '100%', background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
            borderRadius: '14px', padding: '15px', fontSize: '14px', fontWeight: '700',
            color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'inherit'
          }}>Log Out of Prima</button>
        </div>
      )}

      {showSelfie && (
        <SelfieVerification
          onComplete={() => { setShowSelfie(false); fetchProfile() }}
          onSkip={() => setShowSelfie(false)}
        />
      )}
    </div>
  )
}
