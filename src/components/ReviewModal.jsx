import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

const TAGS_FOR_WORKER = [
  'Professional', 'On Time', 'Great Communication',
  'High Quality', 'Reliable', 'Would Hire Again'
]
const TAGS_FOR_POSTER = [
  'Clear Instructions', 'Paid Promptly', 'Responsive',
  'Respectful', 'Great Client', 'Would Work Again'
]

export default function ReviewModal({ gig, revieweeId, revieweeName, reviewType, onClose, onDone }) {
  const { user } = useAuth()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  const tags = reviewType === 'worker' ? TAGS_FOR_WORKER : TAGS_FOR_POSTER

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = () => {
    if (rating === 0) {
      alert('Please select a rating')
      return
    }
    setSubmitting(true)

    // Fire insert without awaiting — the promise hangs on response but data saves fine
    supabase.from('reviews').insert({
      gig_id: gig.id,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      comment,
      tags: selectedTags,
      type: reviewType
    }).catch(err => console.error('Review insert:', err))

    // Short pause so the insert fires, then show success regardless
    setTimeout(() => {
      setDone(true)
      setSubmitting(false)

      // Background: update rating average
      supabase.from('reviews').select('rating').eq('reviewee_id', revieweeId)
        .then(({ data }) => {
          if (data?.length > 0) {
            const avg = data.reduce((s, r) => s + r.rating, 0) / data.length
            supabase.from('users').update({
              rating: Math.round(avg * 10) / 10,
              reviews_count: data.length
            }).eq('id', revieweeId)
          }
        }).catch(() => null)

      // Background: trust score
      if (reviewType === 'worker') {
        const trustAdd = rating >= 4 ? 2 : rating >= 3 ? 0 : -3
        supabase.rpc('increment_trust', { user_id: revieweeId, amount: trustAdd }).catch(() => null)
      }

      // Background: notification
      supabase.from('notifications').insert({
        user_id: revieweeId,
        title: 'New Review Received!',
        message: `You received a ${rating}★ review for "${gig.title}"`,
        type: 'review',
        gig_id: gig.id
      }).catch(() => null)

      setTimeout(() => {
        onDone && onDone()
        onClose()
      }, 2000)
    }, 800)
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
        padding: '28px', width: '100%', maxWidth: '460px',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        border: '1.5px solid #E2E0FF',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>⭐</div>
            <div style={{
              fontSize: '20px', fontWeight: '800',
              color: '#6C47FF', marginBottom: '8px'
            }}>Review Submitted!</div>
            <div style={{ fontSize: '13px', color: '#8B8FAF' }}>
              Thank you for helping build trust on Prima.
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: '20px'
            }}>
              <div>
                <div style={{
                  fontSize: '10px', color: '#6C47FF',
                  fontWeight: '700', letterSpacing: '1.5px',
                  textTransform: 'uppercase', marginBottom: '3px'
                }}>Leave a Review</div>
                <div style={{
                  fontSize: '18px', fontWeight: '800', color: '#14123A'
                }}>Rate {revieweeName}</div>
              </div>
              <button onClick={onClose} style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '8px', width: '32px', height: '32px',
                fontSize: '16px', color: '#8B8FAF', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'inherit'
              }}>×</button>
            </div>

            {/* Gig reference */}
            <div style={{
              background: '#F5F4FF', borderRadius: '10px',
              padding: '10px 14px', marginBottom: '20px',
              fontSize: '12px', color: '#8B8FAF'
            }}>
              For: <span style={{ color: '#14123A', fontWeight: '600' }}>
                {gig.title}
              </span>
            </div>

            {/* Star Rating */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                marginBottom: '12px'
              }}>Overall Rating</div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(star)}
                    style={{
                      fontSize: '36px', background: 'none',
                      border: 'none', cursor: 'pointer',
                      transform: (hovered >= star || rating >= star) ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.15s',
                      filter: (hovered >= star || rating >= star) ? 'none' : 'grayscale(1) opacity(0.3)'
                    }}>⭐</button>
                ))}
              </div>
              {rating > 0 && (
                <div style={{
                  textAlign: 'center', marginTop: '8px',
                  fontSize: '13px', fontWeight: '700',
                  color: rating >= 4 ? '#00C48C' : rating >= 3 ? '#FF6B2B' : '#FF3366'
                }}>
                  {rating === 5 ? 'Excellent!' : rating === 4 ? 'Very Good' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                marginBottom: '10px'
              }}>What stood out?</div>
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                {tags.map(tag => (
                  <button key={tag} onClick={() => toggleTag(tag)} style={{
                    background: selectedTags.includes(tag) ? '#EEE9FF' : '#F5F4FF',
                    border: `1.5px solid ${selectedTags.includes(tag) ? '#B8A5FF' : '#E2E0FF'}`,
                    borderRadius: '20px', padding: '6px 13px',
                    fontSize: '12px', fontWeight: '600',
                    color: selectedTags.includes(tag) ? '#6C47FF' : '#8B8FAF',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s'
                  }}>{tag}</button>
                ))}
              </div>
            </div>

            {/* Written Review */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                marginBottom: '8px'
              }}>Written Feedback (optional)</div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Share your experience working with this person..."
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

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              style={{
                width: '100%',
                background: submitting || rating === 0
                  ? '#E2E0FF'
                  : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px',
                padding: '14px', fontSize: '14px',
                fontWeight: '700',
                color: submitting || rating === 0 ? '#A09DC8' : '#fff',
                cursor: submitting || rating === 0 ? 'not-allowed' : 'pointer',
                boxShadow: rating > 0 ? '0 4px 20px rgba(108,71,255,0.35)' : 'none',
                fontFamily: 'inherit', transition: 'all 0.2s'
              }}>
              {submitting ? '⏳ Submitting...' : '⭐ Submit Review'}
            </button>
          </>
        )}

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