import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { generateReferralCode } from '../utils/referral'
import { getCurrency } from '../data/currencies'

export default function ShareGig({ gig, onClose }) {
  const { profile, refreshProfile } = useAuth()
  const [copied, setCopied] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onClose()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  useEffect(() => {
    if (!profile?.referral_code && profile?.id && !generatingCode) {
      setGeneratingCode(true)
      generateReferralCode(profile.id, profile.username, profile.full_name)
        .then(code => { if (code) refreshProfile() })
        .finally(() => setGeneratingCode(false))
    }
  }, [profile?.id])

  const referralCode = profile?.referral_code || ''
  const hasCode = !!referralCode
  const shareLink = `https://primaplug.com/?gigref=${gig.id}&ref=${referralCode}`

  const copyLink = () => {
    if (!hasCode) return
    navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const gigValue = ((gig.pay_min + gig.pay_max) / 2)
  const estimatedEarning = (gigValue * 0.05).toFixed(2)
  const currency = getCurrency(gig.currency || 'USD')

  const shareWhatsApp = () => {
    const text = `🔥 Check out this gig on PrimaPlug!\n\n*${gig.title}*\n💰 $${gig.pay_min}–$${gig.pay_max}\n📍 ${gig.location || 'Remote'}\n\nApply here: ${shareLink}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const shareTwitter = () => {
    const text = `💼 Found a great gig on PrimaPlug — ${gig.title} paying $${gig.pay_min}–$${gig.pay_max}. Apply now:`
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareLink)}`,
      '_blank'
    )
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
        padding: '28px', width: '100%', maxWidth: '420px',
        border: '1.5px solid #E2E0FF',
        boxShadow: '0 20px 60px rgba(108,71,255,0.25)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '20px'
        }}>
          <div>
            <div style={{
              fontSize: '10px', color: '#6C47FF', fontWeight: '700',
              letterSpacing: '1.5px', textTransform: 'uppercase',
              marginBottom: '3px'
            }}>Share Gig & Earn</div>
            <div style={{
              fontSize: '18px', fontWeight: '800',
              color: '#14123A', lineHeight: '1.3',
              maxWidth: '260px'
            }}>{gig.title}</div>
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

        {/* Reward preview */}
        <div style={{
          background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
          borderRadius: '16px', padding: '16px',
          color: '#fff', marginBottom: '20px', textAlign: 'center'
        }}>
          <div style={{
            fontSize: '11px', opacity: 0.8,
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '6px'
          }}>If they complete the gig you earn</div>
          <div style={{
            fontSize: '32px', fontWeight: '800',
            letterSpacing: '-1px', marginBottom: '3px'
          }}>~{currency.symbol}{estimatedEarning}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            5% of avg gig value · paid to your wallet
          </div>
        </div>

        {/* Share link */}
        {generatingCode ? (
          <div style={{
            background: '#F5F4FF', borderRadius: '12px',
            padding: '14px', marginBottom: '14px',
            textAlign: 'center', fontSize: '12px', color: '#A09DC8', fontWeight: '600'
          }}>Setting up your referral link...</div>
        ) : !hasCode ? (
          <div style={{
            background: '#FFE8EE', border: '1.5px solid #FF99B3',
            borderRadius: '12px', padding: '12px 14px', marginBottom: '14px',
            fontSize: '12px', color: '#FF3366', fontWeight: '600'
          }}>Could not generate your referral link. Please visit Refer &amp; Earn first.</div>
        ) : (
          <div style={{
            background: '#F5F4FF', borderRadius: '12px',
            padding: '12px 14px', marginBottom: '14px',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: '10px'
          }}>
            <div style={{
              fontSize: '11px', color: '#6C47FF',
              fontWeight: '600', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1
            }}>{shareLink}</div>
            <button
              onClick={copyLink}
              style={{
                background: copied ? '#DFFDF4' : '#EEE9FF',
                border: `1.5px solid ${copied ? '#7EECD2' : '#B8A5FF'}`,
                borderRadius: '8px', padding: '6px 12px',
                fontSize: '12px', fontWeight: '700',
                color: copied ? '#00C48C' : '#6C47FF',
                cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'all 0.2s'
              }}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        )}

        {/* Share buttons */}
        {hasCode && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={shareWhatsApp}
              style={{
                flex: 1, background: '#25D366', border: 'none',
                borderRadius: '12px', padding: '12px',
                fontSize: '13px', fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '6px'
              }}>💬 WhatsApp</button>
            <button
              onClick={shareTwitter}
              style={{
                flex: 1, background: '#14123A', border: 'none',
                borderRadius: '12px', padding: '12px',
                fontSize: '13px', fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '6px'
              }}>🐦 Twitter</button>
          </div>
        )}

        {/* How it works */}
        <div style={{
          background: '#F5F4FF', borderRadius: '12px',
          padding: '14px', fontSize: '12px',
          color: '#8B8FAF', lineHeight: '1.6'
        }}>
          <div style={{
            fontWeight: '700', color: '#14123A',
            marginBottom: '6px'
          }}>How it works</div>
          <div>1. Share your link with someone who can do this gig</div>
          <div>2. They click your link and apply</div>
          <div>3. They get accepted and complete the gig</div>
          <div>4. You automatically earn 5% of the gig payment to your wallet</div>
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