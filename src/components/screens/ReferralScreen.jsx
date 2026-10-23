import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { useCredits } from '../../context/CreditsContext'
import { generateReferralCode, REFERRAL_REWARDS } from '../../utils/referral'
import { CREDITS_PER_DOLLAR } from '../../utils/payments'
import { parseTimestamp } from '../../utils/time'

export default function ReferralScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const { credits } = useCredits()
  const [referrals, setReferrals] = useState([])
  const [gigReferrals, setGigReferrals] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [copied, setCopied] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const generationStartedRef = useRef(false)

  const referralCode = profile?.referral_code || ''
  const referralLink = `https://primaplug.com/?ref=${referralCode}`

  const loadReferralData = useCallback(async () => {
    if (!user) return

    const fetchReferrals = async () => {
      const { data } = await supabase
        .from('referrals')
        .select('*, referred:users!referrals_referred_id_fkey(full_name, avatar_url, joined_at)')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
      if (data) setReferrals(data)
    }

    const fetchLeaderboard = async () => {
      const { data } = await supabase
        .from('referrals')
        .select('referrer_id, users!referrals_referrer_id_fkey(full_name, avatar_url, trust_score)')
        .eq('status', 'completed')

      if (data) {
        const counts = {}
        data.forEach(r => {
          const id = r.referrer_id
          if (!counts[id]) {
            counts[id] = {
              id,
              user: r.users,
              count: 0
            }
          }
          counts[id].count++
        })

        const sorted = Object.values(counts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)

        setLeaderboard(sorted)
      }
    }

    const fetchGigReferrals = async () => {
      const { data } = await supabase
        .from('gig_referrals')
        .select('*, referred:users!gig_referrals_referred_id_fkey(full_name, avatar_url), gigs(title, currency)')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
      if (data) setGigReferrals(data)
    }

    fetchReferrals()
    fetchGigReferrals()
    fetchLeaderboard()
  }, [user])

  useEffect(() => {
    loadReferralData()
  }, [loadReferralData])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('referrals-' + user.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'referrals',
        filter: `referrer_id=eq.${user.id}`
      }, () => {
        loadReferralData()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gig_referrals',
        filter: `referrer_id=eq.${user.id}`
      }, () => {
        loadReferralData()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user, loadReferralData])

  useEffect(() => {
    const ensureReferralCode = async () => {
      if (!user || !profile || profile.referral_code || generationStartedRef.current) return

      generationStartedRef.current = true
      setGeneratingCode(true)
      const code = await generateReferralCode(user.id, profile.username, profile.full_name)
      if (code) refreshProfile()
      if (!code) generationStartedRef.current = false
      setGeneratingCode(false)
    }

    ensureReferralCode()
  }, [user, profile, refreshProfile])

  const copyLink = () => {
    if (!referralCode) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareWhatsApp = () => {
    if (!referralCode) return
    const text = `Join me on PrimaPlug — the real-time labor marketplace! Find work or hire skilled people near you. Sign up here: ${referralLink}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const shareTwitter = () => {
    if (!referralCode) return
    const text = `I'm on PrimaPlug — find work or hire skilled people in real time! Join with my link:`
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(referralLink)}`,
      '_blank'
    )
  }

  const completed = referrals.filter(r => r.status === 'completed').length
  const creditsFromReferrals = completed * REFERRAL_REWARDS.referrerCredits
  const pendingGigShares = gigReferrals.filter(r => r.status === 'pending' && !r.reward_given).length
  const paidGigShares = gigReferrals.filter(r => r.status === 'completed' && r.reward_given).length

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '22px', fontWeight: '800',
          color: 'var(--color-text)', marginBottom: '4px'
        }}>Refer & Earn</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Invite people to Prima and earn trust score + Prima Credits
        </div>
      </div>

      {/* Rewards Banner */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
        borderRadius: '20px', padding: '20px',
        color: 'var(--color-surface)', marginBottom: '20px'
      }}>
        <div style={{
          fontSize: '12px', opacity: 0.8,
          textTransform: 'uppercase', letterSpacing: '1.5px',
          marginBottom: '12px'
        }}>For each successful referral</div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '12px', marginBottom: '14px'
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '14px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{
              fontSize: '28px', fontWeight: '800', marginBottom: '3px'
            }}>+{REFERRAL_REWARDS.referrerTrust}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Trust Score</div>
            <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '2px' }}>
              You get
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '14px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{
              fontSize: '28px', fontWeight: '800', marginBottom: '3px'
            }}>{REFERRAL_REWARDS.referrerCredits}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Prima Credits</div>
            <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '2px' }}>
              You get
            </div>
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '10px 14px',
          fontSize: '12px', opacity: 0.9, lineHeight: '1.5'
        }}>
          🎁 Your friend gets {REFERRAL_REWARDS.referredCredits} Prima Credits when they complete their profile
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px', marginBottom: '20px'
      }}>
        {[
          { label: 'Total Referred', value: referrals.length, color: 'var(--color-brand)', icon: '👥' },
          { label: 'Completed', value: completed, color: 'var(--color-success)', icon: '✅' },
          { label: 'Credits Earned', value: creditsFromReferrals, color: 'var(--color-warning-gold)', icon: '⭐' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{
            background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
            borderRadius: '14px', padding: '14px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{icon}</div>
            <div style={{
              fontSize: '20px', fontWeight: '800',
              color, marginBottom: '3px'
            }}>{value}</div>
            <div style={{
              fontSize: '12px', color: 'var(--color-text-subtle)',
              fontWeight: '600', textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Referral Link */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '12px'
        }}>Your Referral Link</div>

        {/* Link display */}
        <div style={{
          background: 'var(--color-page)', borderRadius: '12px',
          padding: '12px 14px', marginBottom: '12px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '10px'
        }}>
          <div style={{
            fontSize: '12px', color: 'var(--color-brand)',
            fontWeight: '600', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1
          }}>{referralCode ? referralLink : 'Generating your referral link...'}</div>
          <button
            onClick={copyLink}
            disabled={!referralCode}
            style={{
              background: copied ? 'var(--color-success-soft)' : 'var(--color-brand-soft)',
              border: `1.5px solid ${copied ? 'var(--color-success-border)' : 'var(--color-brand-border-strong)'}`,
              borderRadius: '8px', padding: '6px 12px',
              fontSize: '12px', fontWeight: '700',
              color: copied ? 'var(--color-success)' : 'var(--color-brand)',
              cursor: referralCode ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              opacity: referralCode ? 1 : 0.65,
              whiteSpace: 'nowrap', transition: 'all 0.2s',
              flexShrink: 0
            }}>
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>

        {/* Your code */}
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'center',
          marginBottom: '14px'
        }}>
          <div style={{
            background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
            borderRadius: '10px', padding: '8px 16px',
            fontSize: '16px', fontWeight: '800',
            color: 'var(--color-brand)', letterSpacing: '2px',
            flex: 1, textAlign: 'center'
          }}>
            {referralCode ? referralCode.toUpperCase() : generatingCode ? 'CREATING...' : 'PENDING'}
          </div>
          <div style={{
            fontSize: '12px', color: 'var(--color-text-subtle)', flex: 1,
            lineHeight: '1.4'
          }}>
            Your unique referral code
          </div>
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={shareWhatsApp}
            disabled={!referralCode}
            style={{
              flex: 1, background: '#25D366',
              border: 'none', borderRadius: '12px', padding: '12px',
              fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
              cursor: referralCode ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              opacity: referralCode ? 1 : 0.65,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
            💬 WhatsApp
          </button>
          <button
            onClick={shareTwitter}
            disabled={!referralCode}
            style={{
              flex: 1, background: 'var(--color-text)',
              border: 'none', borderRadius: '12px', padding: '12px',
              fontSize: '13px', fontWeight: '700', color: 'var(--color-surface)',
              cursor: referralCode ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              opacity: referralCode ? 1 : 0.65,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
            🐦 Twitter
          </button>
          <button
            onClick={copyLink}
            disabled={!referralCode}
            style={{
              flex: 1, background: 'var(--color-page)',
              border: '1.5px solid var(--color-border)',
              borderRadius: '12px', padding: '12px',
              fontSize: '13px', fontWeight: '700',
              color: 'var(--color-text-muted)', cursor: referralCode ? 'pointer' : 'not-allowed',
              opacity: referralCode ? 1 : 0.65,
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
            🔗 Copy
          </button>
        </div>
      </div>

      {/* Gig Share Rewards */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '14px'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          gap: '14px', alignItems: 'flex-start',
          marginBottom: '14px'
        }}>
          <div>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: '6px'
            }}>Gig Share Rewards</div>
            <div style={{
              fontSize: '13px', color: 'var(--color-text)',
              fontWeight: '600', lineHeight: 1.45
            }}>
              Share a gig. If your referred worker applies, gets accepted, and completes the work, you earn 5% of that gig payment.
            </div>
          </div>
          <div style={{
            background: 'var(--color-success-soft)',
            border: '1px solid var(--color-success-border)',
            color: 'var(--color-success)',
            borderRadius: '999px',
            padding: '7px 10px',
            fontSize: '12px',
            fontWeight: '800',
            whiteSpace: 'nowrap'
          }}>
            5% share
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px'
        }}>
          {[
            { label: 'Pending Work', value: pendingGigShares, color: 'var(--color-warning-gold)', bg: 'var(--color-warning-gold-soft)', border: 'var(--color-warning-gold-border)' },
            { label: 'Paid Shares', value: paidGigShares, color: 'var(--color-success)', bg: 'var(--color-success-soft)', border: 'var(--color-success-border)' },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: '12px',
              padding: '12px',
              textAlign: 'center'
            }}>
              <div style={{
                color,
                fontSize: '20px',
                fontWeight: '800',
                marginBottom: '3px'
              }}>{value}</div>
              <div style={{
                fontSize: '12px',
                color: '#6F7190',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1px',
          marginBottom: '14px'
        }}>How It Works</div>
        {[
          { step: '1', text: 'Share your link with friends', icon: '🔗' },
          { step: '2', text: 'They sign up using your link', icon: '👤' },
          { step: '3', text: 'They complete their profile', icon: '✅' },
          { step: '4', text: 'You both get rewarded instantly', icon: '🎉' },
        ].map(({ step, text, icon }) => (
          <div key={step} style={{
            display: 'flex', gap: '12px', alignItems: 'center',
            padding: '10px 0',
            borderBottom: step !== '4' ? '1px solid var(--color-page)' : 'none'
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'var(--color-brand-gradient)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '13px',
              fontWeight: '800', color: 'var(--color-surface)', flexShrink: 0
            }}>{step}</div>
            <span style={{ fontSize: '14px' }}>{icon}</span>
            <div style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: '500' }}>
              {text}
            </div>
          </div>
        ))}
      </div>

      {/* My Referrals */}
      {referrals.length > 0 && (
        <div style={{
          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
          borderRadius: '16px', padding: '18px',
          marginBottom: '14px'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '14px'
          }}>My Referrals ({referrals.length})</div>
          {referrals.map((ref, i) => (
            <div key={ref.id} style={{
              display: 'flex', gap: '10px', alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < referrals.length - 1
                ? '1px solid var(--color-page)' : 'none'
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'var(--color-brand-soft)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '800',
                color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0
              }}>
                {ref.referred?.avatar_url ? (
                  <img src={ref.referred.avatar_url} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : ref.referred?.full_name?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '13px', fontWeight: '600',
                  color: 'var(--color-text)', marginBottom: '2px'
                }}>
                  {ref.referred?.full_name || 'Unknown'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                  Joined {parseTimestamp(ref.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                  })}
                </div>
              </div>
              <div style={{
                background: ref.status === 'completed' ? 'var(--color-success-soft)' : 'var(--color-warning-gold-soft)',
                border: `1px solid ${ref.status === 'completed' ? 'var(--color-success-border)' : 'var(--color-warning-gold-border)'}`,
                borderRadius: '6px', padding: '3px 9px',
                fontSize: '12px', fontWeight: '700',
                color: ref.status === 'completed' ? 'var(--color-success)' : 'var(--color-warning-gold)'
              }}>
                {ref.status === 'completed' ? `✓ +${REFERRAL_REWARDS.referrerCredits} credits` : '⏳ Pending'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Gig Shares */}
      {gigReferrals.length > 0 && (
        <div style={{
          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
          borderRadius: '16px', padding: '18px',
          marginBottom: '14px'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '14px'
          }}>My Gig Shares ({gigReferrals.length})</div>
          {gigReferrals.map((ref, i) => {
            const currency = ref.reward_currency || ref.gigs?.currency || 'NGN'
            const rewardAmount = Number(ref.reward_amount || 0)
            const isPaid = ref.status === 'completed' && ref.reward_given

            return (
              <div key={ref.id} style={{
                display: 'flex', gap: '10px', alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < gigReferrals.length - 1
                  ? '1px solid var(--color-page)' : 'none'
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: isPaid ? 'var(--color-success-soft)' : 'var(--color-warning-gold-soft)',
                  border: `1px solid ${isPaid ? 'var(--color-success-border)' : 'var(--color-warning-gold-border)'}`,
                  display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: '800',
                  color: isPaid ? '#00A876' : 'var(--color-warning-gold)',
                  overflow: 'hidden', flexShrink: 0
                }}>
                  {ref.referred?.avatar_url ? (
                    <img src={ref.referred.avatar_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : ref.referred?.full_name?.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700',
                    color: 'var(--color-text)', marginBottom: '2px',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {ref.gigs?.title || 'Shared gig'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    {ref.referred?.full_name || 'Worker'} · {parseTimestamp(ref.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric'
                    })}
                  </div>
                </div>
                <div style={{
                  background: isPaid ? 'var(--color-success-soft)' : 'var(--color-warning-gold-soft)',
                  border: `1px solid ${isPaid ? 'var(--color-success-border)' : 'var(--color-warning-gold-border)'}`,
                  borderRadius: '8px',
                  padding: '5px 9px',
                  fontSize: '12px',
                  fontWeight: '800',
                  color: isPaid ? '#00A876' : 'var(--color-warning-gold)',
                  whiteSpace: 'nowrap'
                }}>
                  {isPaid ? `${currency} ${rewardAmount.toLocaleString()} paid` : 'Pending completion'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Withdraw Credits */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-success-soft), #E8FFF5)',
        border: '1.5px solid var(--color-success-border)',
        borderRadius: '16px', padding: '18px',
        marginBottom: '14px'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '10px'
        }}>
          <div>
            <div style={{
              fontSize: '14px', fontWeight: '700', color: 'var(--color-text)',
              marginBottom: '2px'
            }}>💸 Withdraw Your Credits</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Convert credits to cash · {CREDITS_PER_DOLLAR} credits = $1
            </div>
          </div>
          <div style={{
            background: 'var(--color-success)', color: 'var(--color-surface)',
            borderRadius: '10px', padding: '6px 12px',
            fontSize: '16px', fontWeight: '800'
          }}>
            {credits?.balance?.toFixed(0) || 0}
          </div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'withdrawal' }))}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, var(--color-success), #00A876)',
            border: 'none', borderRadius: '12px',
            padding: '12px', fontSize: '14px',
            fontWeight: '700', color: 'var(--color-surface)',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 16px rgba(0,196,140,0.3)'
          }}>
          💸 Withdraw Credits
        </button>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div style={{
          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
          borderRadius: '16px', padding: '18px'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
            textTransform: 'uppercase', letterSpacing: '1px',
            marginBottom: '14px'
          }}>🏆 Top Referrers</div>
          {leaderboard.map((item, i) => {
            const medals = ['🥇', '🥈', '🥉']
            const isMe = item.id === user?.id
            return (
              <div key={item.id} style={{
                display: 'flex', gap: '10px', alignItems: 'center',
                borderBottom: i < leaderboard.length - 1
                  ? '1px solid var(--color-page)' : 'none',
                background: isMe ? 'var(--color-surface-tint)' : 'transparent',
                borderRadius: isMe ? '10px' : '0',
                padding: isMe ? '10px' : '10px 0',
                margin: isMe ? '0 -4px' : '0'
              }}>
                <div style={{
                  fontSize: i < 3 ? '20px' : '14px',
                  fontWeight: '700', color: 'var(--color-text-subtle)',
                  width: '28px', textAlign: 'center', flexShrink: 0
                }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '9px',
                  background: 'var(--color-brand-soft)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '800',
                  color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0
                }}>
                  {item.user?.avatar_url ? (
                    <img src={item.user.avatar_url} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : item.user?.full_name?.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: isMe ? '700' : '500',
                    color: isMe ? 'var(--color-brand)' : 'var(--color-text)'
                  }}>
                    {item.user?.full_name || 'Unknown'}
                    {isMe && ' (You)'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    Trust {item.user?.trust_score || 100}%
                  </div>
                </div>
                <div style={{
                  background: i === 0 ? 'var(--color-warning-gold-soft)' : 'var(--color-page)',
                  border: `1px solid ${i === 0 ? 'var(--color-warning-gold-border)' : 'var(--color-border)'}`,
                  borderRadius: '8px', padding: '5px 10px',
                  textAlign: 'center', flexShrink: 0
                }}>
                  <div style={{
                    fontSize: '14px', fontWeight: '800',
                    color: i === 0 ? 'var(--color-warning-gold)' : 'var(--color-brand)'
                  }}>{item.count}</div>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-text-subtle)',
                    textTransform: 'uppercase', letterSpacing: '0.3px'
                  }}>referrals</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
