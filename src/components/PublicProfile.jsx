import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { uploadToR2 } from '../utils/r2upload'
import { useAuth } from '../context/AuthContext'
import ReportModal from './ReportModal'
import BrandIcon from './BrandIcon'
import VerificationBadge from './VerificationBadge'
import { parseTimestamp } from '../utils/time'
import { showToast } from '../utils/toast'

export default function PublicProfile({ userId, onClose, standalone = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [gigs, setGigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState([])
  const [messaging, setMessaging] = useState(false)
  const [messageSent, setMessageSent] = useState(false)
  const [existingConvo, setExistingConvo] = useState(false)
  const [activeTab, setActiveTab] = useState('about')
  const [workItems, setWorkItems] = useState([])
  const [workFormOpen, setWorkFormOpen] = useState(false)
  const [editingWork, setEditingWork] = useState(null)
  const [workTitle, setWorkTitle] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [workTags, setWorkTags] = useState('')
  const [workFile, setWorkFile] = useState(null)
  const [workPreview, setWorkPreview] = useState('')
  const [savingWork, setSavingWork] = useState(false)
  const [deletingWorkId, setDeletingWorkId] = useState(null)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileEditForm, setProfileEditForm] = useState({})
  const [profileAvatarFile, setProfileAvatarFile] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const isOwnProfile = currentUser?.id === userId
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    if (userId && standalone) {
      fetchProfile()
      fetchUserGigs()
      fetchReviews()
      fetchWorkItems()
    }
  }, [userId, standalone])

  useEffect(() => {
    if (!userId || standalone) return
    navigate(`/profile/${encodeURIComponent(userId)}`, {
      state: { from: `${location.pathname}${location.search}` }
    })
  }, [userId, standalone, navigate, location.pathname, location.search])

  const handleClose = () => {
    if (!standalone) {
      onClose?.()
      return
    }
    if (location.state?.from) navigate(location.state.from)
    else navigate(currentUser ? '/dashboard' : '/', { replace: true })
  }

  const shareProfile = async () => {
    const url = `${window.location.origin}/profile/${encodeURIComponent(userId)}`
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.full_name || 'Prima'} on PrimaPlug`, url })
      else {
        await navigator.clipboard.writeText(url)
        showToast('Profile link copied', 'success')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('Could not share profile link', 'error')
    }
  }

  useEffect(() => {
    if (userId && currentUser && !isOwnProfile) {
      supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_1.eq.${currentUser.id},participant_2.eq.${userId}),` +
          `and(participant_1.eq.${userId},participant_2.eq.${currentUser.id})`
        )
        .maybeSingle()
        .then(({ data }) => { if (data) setExistingConvo(true) })
    }
  }, [userId, currentUser])

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (data) {
      setProfile(data)
      setProfileEditForm({
        full_name: data.full_name || '',
        username: data.username || '',
        location: data.location || '',
        bio: data.bio || '',
        work_experience: data.work_experience || '',
        skills: Array.isArray(data.skills) ? data.skills.join(', ') : '',
        website_url: data.website_url || '',
        portfolio_url: data.portfolio_url || '',
        social_linkedin: data.social_linkedin || '',
        social_twitter: data.social_twitter || '',
      })
    }
    setLoading(false)
  }

  const saveProfileDetails = async (event) => {
    event.preventDefault()
    if (!currentUser || !isOwnProfile) return
    const fullName = profileEditForm.full_name?.trim()
    const username = profileEditForm.username?.trim().toLowerCase().replace(/\s/g, '')
    if (!fullName || !username) return showToast('Name and username are required', 'error')
    if (profileAvatarFile && !['image/jpeg', 'image/png', 'image/webp'].includes(profileAvatarFile.type)) {
      return showToast('Choose a JPG, PNG, or WebP profile photo', 'error')
    }
    if (profileAvatarFile && profileAvatarFile.size > 10 * 1024 * 1024) {
      return showToast('Profile photos must be 10 MB or smaller', 'error')
    }
    setSavingProfile(true)
    try {
      let avatarUrl = profile.avatar_url
      if (profileAvatarFile) avatarUrl = await uploadToR2(profileAvatarFile, 'avatars')
      const payload = {
        full_name: fullName,
        username,
        location: profileEditForm.location?.trim() || '',
        bio: profileEditForm.bio?.trim() || '',
        work_experience: profileEditForm.work_experience?.trim() || '',
        skills: [...new Set(profileEditForm.skills.split(',').map(skill => skill.trim()).filter(Boolean))].slice(0, 30),
        website_url: profileEditForm.website_url?.trim() || '',
        portfolio_url: profileEditForm.portfolio_url?.trim() || '',
        social_linkedin: profileEditForm.social_linkedin?.trim() || '',
        social_twitter: profileEditForm.social_twitter?.trim() || '',
        avatar_url: avatarUrl,
      }
      const { data, error } = await supabase.from('users').update(payload).eq('id', userId).select('*').maybeSingle()
      if (error) throw error
      if (!data) throw new Error('No profile was updated. Please refresh and try again.')
      setProfile(data)
      setProfileEditForm({ ...payload, skills: payload.skills.join(', ') })
      setProfileAvatarFile(null)
      setProfileEditing(false)
      showToast('Public profile updated', 'success')
    } catch (error) {
      showToast(`Could not update profile: ${error.message}`, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const fetchReviews = async () => {
  const { data } = await supabase
    .from('reviews')
    .select('*, users!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (data) setReviews(data)
}

  const fetchWorkItems = async () => {
    const { data, error } = await supabase
      .from('profile_work_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Could not load profile work:', error.message)
      return
    }
    setWorkItems(data || [])
  }

  useEffect(() => {
    if (!workFile) {
      setWorkPreview('')
      return
    }
    const previewUrl = URL.createObjectURL(workFile)
    setWorkPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [workFile])

  const resetWorkForm = () => {
    setWorkFormOpen(false)
    setEditingWork(null)
    setWorkTitle('')
    setWorkDescription('')
    setWorkTags('')
    setWorkFile(null)
  }

  const startEditWork = (item) => {
    setEditingWork(item)
    setWorkTitle(item.title)
    setWorkDescription(item.description || '')
    setWorkTags((item.skill_tags || []).join(', '))
    setWorkFile(null)
    setWorkFormOpen(true)
  }

  const handleWorkFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    if (![...imageTypes, ...videoTypes].includes(file.type)) {
      showToast('Choose a JPG, PNG, WebP, GIF, MP4, WebM, or MOV file', 'error')
      return
    }
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      showToast(isVideo ? 'Videos must be 50 MB or smaller' : 'Images must be 10 MB or smaller', 'error')
      return
    }
    setWorkFile(file)
  }

  const saveWorkItem = async (event) => {
    event.preventDefault()
    if (!currentUser || !isOwnProfile) return
    if (!workTitle.trim()) return showToast('Add a title for this work sample', 'error')
    if (!editingWork && !workFile) return showToast('Choose a photo or video to upload', 'error')
    setSavingWork(true)
    try {
      const mediaUrl = workFile
        ? await uploadToR2(workFile, `profile-work/${userId}`)
        : editingWork.media_url
      const payload = {
        user_id: userId,
        title: workTitle.trim(),
        description: workDescription.trim(),
        skill_tags: [...new Set(workTags.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 10),
        media_url: mediaUrl,
        media_type: workFile ? (workFile.type.startsWith('video/') ? 'video' : 'image') : editingWork.media_type,
        updated_at: new Date().toISOString(),
      }
      const result = editingWork
        ? await supabase.from('profile_work_items').update(payload).eq('id', editingWork.id).eq('user_id', userId)
        : await supabase.from('profile_work_items').insert(payload)
      if (result.error) throw result.error
      await fetchWorkItems()
      resetWorkForm()
      showToast(editingWork ? 'Work sample updated' : 'Work sample added', 'success')
    } catch (error) {
      showToast(`Could not save work sample: ${error.message}`, 'error')
    } finally {
      setSavingWork(false)
    }
  }

  const removeWorkItem = async (item) => {
    const { error } = await supabase.from('profile_work_items').delete().eq('id', item.id).eq('user_id', userId)
    if (error) return showToast(`Could not remove work sample: ${error.message}`, 'error')
    setWorkItems(items => items.filter(work => work.id !== item.id))
    setDeletingWorkId(null)
    showToast('Work sample removed', 'success')
  }

  const handleMessage = async () => {
    if (!currentUser || isOwnProfile) return
    setMessaging(true)

    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_1.eq.${currentUser.id},participant_2.eq.${userId}),` +
          `and(participant_1.eq.${userId},participant_2.eq.${currentUser.id})`
        )
        .maybeSingle()

      let convoId = existing?.id

      if (!convoId) {
        const { data: newConvo } = await supabase
          .from('conversations')
          .insert({
            participant_1: currentUser.id,
            participant_2: userId,
            last_message: '',
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single()
        convoId = newConvo?.id
      }

      setMessaging(false)
      setMessageSent(true)

      setTimeout(() => {
        handleClose()
        window.dispatchEvent(new CustomEvent('openChatWithUser', {
          detail: { userId }
        }))
      }, 600)
    } catch (e) {
      console.log('Message error:', e)
      setMessaging(false)
    }
  }

  const fetchUserGigs = async () => {
    const { data } = await supabase
      .from('gigs')
      .select('*')
      .eq('poster_id', userId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setGigs(data)
  }

  if (!userId || !standalone) return null

  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      width: '100%',
      background: 'var(--color-page)',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-surface)',
        width: '100%', maxWidth: '1180px',
        minHeight: '100vh', minHeight: '100dvh', margin: '0 auto',
        boxSizing: 'border-box',
        overflowY: 'visible', border: 'none',
        boxShadow: '0 12px 40px rgba(31,24,77,0.06)'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          position: 'sticky', top: 0, zIndex: 5,
          padding: '12px 20px', background: 'var(--color-surface)',
          boxShadow: '0 4px 18px rgba(31,24,77,0.06)'
        }}>
          <button
            onClick={handleClose}
            style={{
              minHeight: '40px', padding: '0 12px',
              borderRadius: '12px', border: 'none',
              background: 'var(--color-page)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px', cursor: 'pointer',
              fontSize: '14px', fontWeight: '700', color: 'var(--color-text-muted)',
              fontFamily: 'inherit'
            }}
            aria-label="Go back">
            <span aria-hidden="true">←</span> Back
          </button>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text)' }}>Public profile</div>
        </div>

        {loading ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            color: 'var(--color-text-subtle)', fontSize: '14px'
          }}>Loading profile...</div>
        ) : !profile ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            color: 'var(--color-text-subtle)', fontSize: '14px'
          }}>Profile not found</div>
        ) : (
            <div style={{ padding: '20px clamp(16px, 3vw, 32px) 40px' }}>

            {/* Hero */}
            <div style={{
              background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
              borderRadius: '20px', padding: '20px',
              color: 'var(--color-surface)', marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex', gap: '14px',
                alignItems: 'flex-start', marginBottom: '12px'
              }}>
                {/* Avatar */}
                <div style={{
                  width: '64px', height: '64px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.25)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '26px',
                  fontWeight: '800', border: '2px solid rgba(255,255,255,0.4)',
                  overflow: 'hidden', flexShrink: 0
                }}>
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    profile.full_name?.charAt(0)?.toUpperCase() || '?'
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '20px', fontWeight: '800', marginBottom: '5px'
                  }}>
                    {profile.full_name}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '8px' }}>
                    @{profile.username}
                  </div>
                  {profile.location && (
                    <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '10px' }}>
                      📍 {profile.location}
                    </div>
                  )}
                  {profile.is_verified && (
                    <div style={{ marginLeft: '14px' }}>
                      <VerificationBadge onDark size="small" />
                    </div>
                  )}
                </div>

                {/* Trust */}
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '12px', padding: '10px 12px',
                  textAlign: 'center', flexShrink: 0
                }}>
                  <div style={{ fontSize: '20px', fontWeight: '800' }}>
                    {profile.trust_score ?? 0}%
                  </div>
                  <div style={{
                    fontSize: '12px', opacity: 0.7,
                    fontWeight: '700', letterSpacing: '.5px'
                  }}>TRUST</div>
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <div style={{
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '10px', padding: '10px 12px',
                  fontSize: '12px', lineHeight: '1.6'
                }}>{profile.bio}</div>
              )}
            </div>

            {/* Message Button — top position like LinkedIn/Facebook */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {!isOwnProfile && currentUser && (
              <button
                onClick={handleMessage}
                disabled={messaging || messageSent}
                style={{
                  flex: '1 1 220px',
                  background: messageSent ? 'var(--color-success-soft)' : 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 100%)',
                  border: 'none',
                  borderRadius: '14px', padding: '14px',
                  fontSize: '15px', fontWeight: '700',
                  color: messageSent ? 'var(--color-success)' : 'var(--color-surface)',
                  cursor: messaging || messageSent ? 'default' : 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  boxShadow: messageSent ? 'none' : '0 4px 16px rgba(108,71,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                <BrandIcon
                  name={messageSent ? 'accepted' : 'compose'}
                  size={24}
                  active={!messageSent}
                />
                {messageSent ? 'Opening Chat...' : messaging ? 'Opening...' : existingConvo ? 'Continue Chat' : 'Message'}
              </button>
            )}
            {!isOwnProfile && currentUser && (
              <button
                onClick={() => setShowReport(true)}
                style={{
                  flex: '1 1 140px',
                  background: 'var(--color-danger-soft)', border: '1.5px solid var(--color-danger-border)',
                  borderRadius: '14px', padding: '11px',
                  fontSize: '13px', fontWeight: '700',
                  color: 'var(--color-danger)', cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px'
                }}>
                🚨 Report User
              </button>
            )}
            {isOwnProfile && (
              <button onClick={() => setProfileEditing(value => !value)} style={{
                flex: '1 1 180px', minHeight: '44px', padding: '10px 14px',
                border: 'none', borderRadius: '14px', background: 'var(--color-brand-gradient)',
                color: 'var(--color-surface)', fontSize: '14px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>{profileEditing ? 'Close editor' : 'Edit profile'}</button>
            )}
            <button onClick={shareProfile} style={{
              flex: '1 1 140px', minHeight: '44px', padding: '10px 14px',
              border: 'none', borderRadius: '14px', background: 'var(--color-brand-soft)',
              color: 'var(--color-brand)', fontSize: '14px', fontWeight: '700',
              cursor: 'pointer', fontFamily: 'inherit'
            }}>Share profile</button>
            </div>
            {isOwnProfile && profileEditing && (
              <div style={{
                background: 'var(--color-surface)', borderRadius: '16px',
                padding: '18px', marginBottom: '18px',
                boxShadow: '0 6px 24px rgba(31,24,77,0.08)'
              }}>
                <form onSubmit={saveProfileDetails} style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text)' }}>Edit public profile</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '12px' }}>
                    {[
                      ['full_name', 'Name', 'text'],
                      ['username', 'Username', 'text'],
                      ['location', 'Location', 'text'],
                    ].map(([field, label, type]) => (
                      <label key={field} style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                        {label}
                        <input required={field !== 'location'} maxLength={field === 'full_name' ? 100 : 80} type={type} value={profileEditForm[field] || ''}
                          onChange={e => setProfileEditForm(form => ({ ...form, [field]: e.target.value }))}
                          style={{ minHeight: '42px', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-page)', color: 'var(--color-text)', font: 'inherit' }} />
                      </label>
                    ))}
                    {[
                      ['bio', 'About', 500],
                      ['work_experience', 'Work experience', 2000],
                    ].map(([field, label, limit]) => (
                      <label key={field} style={{ display: 'grid', gap: '5px', gridColumn: '1 / -1', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                        {label}
                        <textarea maxLength={limit} rows={field === 'bio' ? 3 : 4} value={profileEditForm[field] || ''}
                          onChange={e => setProfileEditForm(form => ({ ...form, [field]: e.target.value }))}
                          style={{ boxSizing: 'border-box', padding: '10px 11px', border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-page)', color: 'var(--color-text)', font: 'inherit', resize: 'vertical' }} />
                      </label>
                    ))}
                    {[
                      ['skills', 'Skills (comma separated)'],
                      ['website_url', 'Website'],
                      ['portfolio_url', 'Portfolio link'],
                      ['social_linkedin', 'LinkedIn'],
                      ['social_twitter', 'X / Twitter'],
                    ].map(([field, label]) => (
                      <label key={field} style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                        {label}
                        <input maxLength={field === 'skills' ? 500 : 300} type="text" value={profileEditForm[field] || ''}
                          onChange={e => setProfileEditForm(form => ({ ...form, [field]: e.target.value }))}
                          style={{ minHeight: '42px', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-page)', color: 'var(--color-text)', font: 'inherit' }} />
                      </label>
                    ))}
                  </div>
                  <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                    Profile photo (optional)
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setProfileAvatarFile(e.target.files?.[0] || null)} />
                  </label>
                  {profileAvatarFile && <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>Selected: {profileAvatarFile.name}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" disabled={savingProfile} onClick={() => { setProfileEditing(false); setProfileAvatarFile(null) }} style={{ minHeight: '42px', padding: '9px 14px', border: 'none', borderRadius: '10px', background: 'var(--color-page)', color: 'var(--color-text-muted)', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                    <button type="submit" disabled={savingProfile} style={{ minHeight: '42px', padding: '9px 16px', border: 'none', borderRadius: '10px', background: 'var(--color-brand-gradient)', color: '#fff', fontWeight: '700', cursor: savingProfile ? 'wait' : 'pointer' }}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
                  </div>
                </form>
              </div>
            )}

            {/* Stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
              gap: '8px', marginBottom: '16px'
            }}>
              {[
                ['Trust', `${profile.trust_score ?? 0}%`, 'var(--color-brand)'],
                ['Done', `${profile.gigs_completed || 0}`, 'var(--color-success)'],
                ['Rating', (profile.reviews_count || 0) > 0 ? `${Number(profile.rating || 0).toFixed(1)}★` : '0.0★', 'var(--color-warning-gold)'],
                ['Reviews', `${profile.reviews_count || 0}`, 'var(--color-warning)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  background: 'var(--color-page)', borderRadius: '10px',
                  padding: '10px 6px', textAlign: 'center',
                  border: '1.5px solid var(--color-border)'
                }}>
                  <div style={{
                    fontSize: '16px', fontWeight: '800',
                    color, marginBottom: '2px'
                  }}>{val}</div>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-text-subtle)',
                    fontWeight: '600', textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>{label}</div>
                </div>
              ))}
            </div>

            <div role="tablist" aria-label="Profile sections" style={{
              display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '18px',
              padding: '4px', borderRadius: '14px', background: 'var(--color-page)'
            }}>
              {[
                ['about', 'About'],
                ['work', `Work${workItems.length ? ` (${workItems.length})` : ''}`],
                ['gigs', `Gigs${gigs.length ? ` (${gigs.length})` : ''}`],
                ['reviews', `Reviews${reviews.length ? ` (${reviews.length})` : ''}`],
              ].map(([key, label]) => (
                <button key={key} role="tab" aria-selected={activeTab === key}
                  onClick={() => setActiveTab(key)} style={{
                    minHeight: '42px', padding: '8px 16px', border: 'none', borderRadius: '11px',
                    background: activeTab === key ? 'var(--color-surface)' : 'transparent',
                    color: activeTab === key ? 'var(--color-brand)' : 'var(--color-text-muted)',
                    fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap', cursor: 'pointer',
                    boxShadow: activeTab === key ? '0 3px 12px rgba(31,24,77,0.08)' : 'none',
                    fontFamily: 'inherit'
                  }}>{label}</button>
              ))}
            </div>

            {/* About */}
            {activeTab === 'about' && <>
            {profile.skills && profile.skills.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '10px'
                }}>Skills</div>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {profile.skills.map(skill => (
                    <span key={skill} style={{
                      background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '20px', padding: '6px 13px',
                      fontSize: '12px', fontWeight: '600', color: 'var(--color-brand)'
                    }}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            {profile.work_experience && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '10px'
                }}>Experience</div>
                <div style={{
                  background: 'var(--color-page)', borderRadius: '12px',
                  padding: '14px', fontSize: '13px',
                  color: 'var(--color-text-muted)', lineHeight: '1.7',
                  border: '1.5px solid var(--color-border)'
                }}>{profile.work_experience}</div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Location & details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                {[
                  ['Location', profile.location || 'Not shared'],
                  ['Work type', [profile.physical_mode && 'In person', profile.digital_mode && 'Remote'].filter(Boolean).join(' · ') || 'Flexible'],
                  ['Member since', profile.joined_at ? parseTimestamp(profile.joined_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Prima member'],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '13px 14px', borderRadius: '14px', background: 'var(--color-page)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)', fontWeight: '700', marginBottom: '5px' }}>{label}</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: '600', overflowWrap: 'anywhere' }}>{value}</div>
                  </div>
                ))}
              </div>
              {(profile.website_url || profile.portfolio_url || profile.social_linkedin || profile.social_twitter) && (
                <div style={{ marginTop: '12px', padding: '14px', borderRadius: '14px', background: 'var(--color-page)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontWeight: '700', marginBottom: '8px' }}>Website & links</div>
                  {[['Website', profile.website_url], ['Portfolio', profile.portfolio_url], ['LinkedIn', profile.social_linkedin], ['X / Twitter', profile.social_twitter]].filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '5px 0', fontSize: '13px' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                      <a href={String(value).match(/^https?:\/\//i) ? value : `https://${value}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-brand)', overflowWrap: 'anywhere', textAlign: 'right', textDecoration: 'none' }}>{String(value).replace(/^https?:\/\//i, '')}</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>}

            {activeTab === 'work' && (
              <section aria-label="Work samples">
                {isOwnProfile && !workFormOpen && (
                  <button onClick={() => { setEditingWork(null); setWorkFormOpen(true) }} style={{
                    width: '100%', minHeight: '48px', padding: '12px 16px', marginBottom: '16px',
                    border: '1.5px dashed var(--color-brand-border-strong)', borderRadius: '14px',
                    background: 'var(--color-brand-tint)', color: 'var(--color-brand)',
                    fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit'
                  }}>+ Add work sample</button>
                )}

                {isOwnProfile && workFormOpen && (
                  <form onSubmit={saveWorkItem} style={{
                    display: 'grid', gap: '12px', padding: '16px', marginBottom: '18px',
                    borderRadius: '16px', background: 'var(--color-page)'
                  }}>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text)' }}>
                      {editingWork ? 'Edit work sample' : 'Add work sample'}
                    </div>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                      Title
                      <input required maxLength={100} value={workTitle} onChange={e => setWorkTitle(e.target.value)} placeholder="What did you create or complete?" style={{
                        width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px',
                        border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-surface)',
                        color: 'var(--color-text)', font: 'inherit'
                      }} />
                    </label>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                      Description
                      <textarea maxLength={2000} rows={3} value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Describe your contribution and the result" style={{
                        width: '100%', boxSizing: 'border-box', padding: '10px 12px', resize: 'vertical',
                        border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-surface)',
                        color: 'var(--color-text)', font: 'inherit'
                      }} />
                    </label>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                      Skills (comma separated)
                      <input maxLength={300} value={workTags} onChange={e => setWorkTags(e.target.value)} placeholder="e.g. Flutter, UI design, carpentry" style={{
                        width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px',
                        border: '1px solid var(--color-border)', borderRadius: '10px', background: 'var(--color-surface)',
                        color: 'var(--color-text)', font: 'inherit'
                      }} />
                    </label>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)' }}>
                      Photo or video {editingWork ? '(optional replacement)' : ''}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleWorkFile} style={{
                        width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '10px',
                        background: 'var(--color-surface)', color: 'var(--color-text-muted)', font: 'inherit'
                      }} />
                    </label>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>Images up to 10 MB · Videos up to 50 MB · JPG, PNG, WebP, GIF, MP4, WebM, MOV</div>
                    {(workPreview || (editingWork && !workFile)) && (
                      <div style={{ maxWidth: '420px', maxHeight: '260px', overflow: 'hidden', borderRadius: '12px', background: '#111' }}>
                        {workFile ? (workFile.type.startsWith('video/')
                          ? <video src={workPreview} controls playsInline style={{ display: 'block', width: '100%', maxHeight: '260px', objectFit: 'contain' }} />
                          : <img src={workPreview} alt="Selected work preview" style={{ display: 'block', width: '100%', maxHeight: '260px', objectFit: 'contain' }} />
                        ) : editingWork.media_type === 'video'
                          ? <video src={editingWork.media_url} controls playsInline style={{ display: 'block', width: '100%', maxHeight: '260px', objectFit: 'contain' }} />
                          : <img src={editingWork.media_url} alt="Current work sample" style={{ display: 'block', width: '100%', maxHeight: '260px', objectFit: 'contain' }} />}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="button" onClick={resetWorkForm} disabled={savingWork} style={{
                        minHeight: '42px', padding: '8px 14px', border: 'none', borderRadius: '10px',
                        background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontWeight: '700', cursor: 'pointer'
                      }}>Cancel</button>
                      <button type="submit" disabled={savingWork} style={{
                        minHeight: '42px', padding: '8px 16px', border: 'none', borderRadius: '10px',
                        background: 'var(--color-brand-gradient)', color: '#fff', fontWeight: '700', cursor: savingWork ? 'wait' : 'pointer'
                      }}>{savingWork ? 'Uploading…' : editingWork ? 'Save changes' : 'Publish work'}</button>
                    </div>
                  </form>
                )}

                {workItems.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '14px' }}>
                    {workItems.map(item => (
                      <article key={item.id} style={{ overflow: 'hidden', borderRadius: '16px', background: 'var(--color-page)', boxShadow: '0 5px 18px rgba(31,24,77,0.08)' }}>
                        <div style={{ width: '100%', aspectRatio: '16 / 10', background: '#111', overflow: 'hidden' }}>
                          {item.media_type === 'video'
                            ? <video src={item.media_url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <img src={item.media_url} alt={item.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ padding: '14px' }}>
                          <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '6px' }}>{item.title}</div>
                          {item.description && <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.55', whiteSpace: 'pre-wrap' }}>{item.description}</p>}
                          {!!item.skill_tags?.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{item.skill_tags.map(tag => <span key={tag} style={{ padding: '4px 9px', borderRadius: '20px', background: 'var(--color-brand-soft)', color: 'var(--color-brand)', fontSize: '11px', fontWeight: '700' }}>{tag}</span>)}</div>}
                          {isOwnProfile && <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button onClick={() => startEditWork(item)} style={{ flex: 1, minHeight: '38px', border: 'none', borderRadius: '9px', background: 'var(--color-surface)', color: 'var(--color-brand)', fontWeight: '700', cursor: 'pointer' }}>Edit</button>
                            {deletingWorkId === item.id ? <>
                              <button onClick={() => removeWorkItem(item)} style={{ minHeight: '38px', padding: '0 10px', border: 'none', borderRadius: '9px', background: 'var(--color-danger)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>Confirm delete</button>
                              <button onClick={() => setDeletingWorkId(null)} style={{ minHeight: '38px', padding: '0 10px', border: 'none', borderRadius: '9px', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                            </> : <button onClick={() => setDeletingWorkId(item.id)} style={{ flex: 1, minHeight: '38px', border: 'none', borderRadius: '9px', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', fontWeight: '700', cursor: 'pointer' }}>Delete</button>}
                          </div>}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : !workFormOpen && <div style={{ padding: '32px 20px', textAlign: 'center', borderRadius: '16px', background: 'var(--color-page)' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-text)', marginBottom: '5px' }}>{isOwnProfile ? 'Show people what you can do' : 'No work samples yet'}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)' }}>{isOwnProfile ? 'Add photos or a video of work you have completed.' : 'This person has not added work samples yet.'}</div>
                </div>}
              </section>
            )}

            {/* Active Gigs */}
            {activeTab === 'gigs' && (gigs.length > 0 ? (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '10px'
                }}>Active Gigs ({gigs.length})</div>
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                  {gigs.map(gig => (
                    <div key={gig.id} style={{
                      background: 'var(--color-page)', borderRadius: '12px',
                      padding: '12px 14px', border: '1.5px solid var(--color-border)',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{
                          fontSize: '13px', fontWeight: '700',
                          color: 'var(--color-text)', marginBottom: '3px'
                        }}>{gig.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                          {gig.field} · {gig.type === 'physical' ? '📌 Local' : '💻 Remote'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '14px', fontWeight: '800', color: 'var(--color-success)'
                      }}>
                        ${gig.pay_min}+
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div style={{ padding: '28px', textAlign: 'center', borderRadius: '16px', background: 'var(--color-page)', color: 'var(--color-text-subtle)' }}>No active gigs right now.</div>)}

            {/* Reviews */}
            {activeTab === 'reviews' && (reviews.length > 0 ? (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '12px'
                }}>
                  Reviews ({reviews.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {reviews.map(review => (
                    <div key={review.id} style={{
                      background: 'var(--color-page)', borderRadius: '14px',
                      padding: '14px', border: '1.5px solid var(--color-border)'
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', marginBottom: '8px'
                      }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'var(--color-brand-soft)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: '800',
                            color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0
                          }}>
                            {review.users?.avatar_url ? (
                              <img src={review.users.avatar_url} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              review.users?.full_name?.charAt(0) || '?'
                            )}
                          </div>
                          <div>
                            <div style={{
                              fontSize: '12px', fontWeight: '700', color: 'var(--color-text)'
                            }}>
                              {review.users?.full_name || 'Anonymous'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                              {parseTimestamp(review.created_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {[1,2,3,4,5].map(s => (
                            <span key={s} style={{
                              fontSize: '14px',
                              filter: s <= review.rating ? 'none' : 'grayscale(1) opacity(0.3)'
                            }}>⭐</span>
                          ))}
                        </div>
                      </div>

                      {review.tags && review.tags.length > 0 && (
                        <div style={{
                          display: 'flex', gap: '5px',
                          flexWrap: 'wrap', marginBottom: '7px'
                        }}>
                          {review.tags.map(tag => (
                            <span key={tag} style={{
                              background: 'var(--color-brand-soft)', borderRadius: '20px',
                              padding: '3px 9px', fontSize: '12px',
                              fontWeight: '600', color: 'var(--color-brand)'
                            }}>{tag}</span>
                          ))}
                        </div>
                      )}

                      {review.comment && (
                        <div style={{
                          fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6'
                        }}>{review.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : <div style={{ padding: '28px', textAlign: 'center', borderRadius: '16px', background: 'var(--color-page)', color: 'var(--color-text-subtle)' }}>No reviews yet.</div>)}

          </div>
        )}

        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      {showReport && (
        <ReportModal
          reportedUserId={profile?.id}
          type="user"
          name={profile?.full_name}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
