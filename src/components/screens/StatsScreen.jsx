import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import BrandIcon from '../BrandIcon'
import { useCredits } from '../../context/CreditsContext'
import ScreenLoader from '../ScreenLoader'

const LEVELS = [
  {
    key: 'new',
    label: 'New Member',
    icon: '🌱',
    brandIcon: 'profile',
    color: 'var(--color-text-muted)',
    bg: 'var(--color-page)',
    border: 'var(--color-border)',
    min: 0,
    desc: 'Just getting started on Prima'
  },
  {
    key: 'rising',
    label: 'Rising',
    icon: '⚡',
    brandIcon: 'open',
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-soft)',
    border: 'var(--color-warning-border)',
    min: 3,
    desc: 'Proving yourself — keep going!'
  },
  {
    key: 'pro',
    label: 'Pro',
    icon: '🎯',
    brandIcon: 'accepted',
    color: 'var(--color-brand)',
    bg: 'var(--color-brand-soft)',
    border: 'var(--color-brand-border-strong)',
    min: 10,
    desc: 'Trusted by the community'
  },
  {
    key: 'elite',
    label: 'Elite',
    icon: '🏆',
    brandIcon: 'level',
    color: 'var(--color-warning-gold)',
    bg: 'var(--color-warning-gold-soft)',
    border: 'var(--color-warning-gold-border)',
    min: 25,
    desc: 'Top tier — the best of Prima'
  },
]

export default function StatsScreen() {
  const { user } = useAuth()
  const { credits } = useCredits()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    const fetchStats = async () => {
      if (!user?.id) {
        setStats(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setLoadError('')
      const [profileResult, gigsResult, applicationsResult, reviewsResult, receiptsResult] = await Promise.all([
        supabase.from('users').select('trust_score, level, level_progress, gigs_completed')
          .eq('id', user.id).maybeSingle(),
        supabase.from('gigs').select('id, status, deleted_at, expires_at')
          .eq('poster_id', user.id).is('deleted_at', null),
        supabase.from('applications').select('id, status').eq('worker_id', user.id),
        supabase.from('reviews').select('rating').eq('reviewee_id', user.id),
        supabase.from('receipts').select('amount, currency, gig:gigs(currency)')
          .eq('worker_id', user.id).eq('completed', true),
      ])
      const failed = [profileResult, gigsResult, applicationsResult, reviewsResult, receiptsResult]
        .find(result => result.error)
      if (failed) {
        console.error('My Stats query failed:', failed.error)
        if (active) {
          setLoadError('We couldn’t load your stats. Please try again.')
          setLoading(false)
        }
        return
      }

      const profile = profileResult.data
      const postedGigs = gigsResult.data || []
      const applications = applicationsResult.data || []
      const reviews = reviewsResult.data || []
      const receipts = receiptsResult.data || []
      const earnedByCurrency = receipts.reduce((totals, receipt) => {
        const code = String(receipt.currency || receipt.gig?.currency || 'NGN').toUpperCase()
        totals[code] = (totals[code] || 0) + Number(receipt.amount || 0)
        return totals
      }, {})
      const avgRating = reviews.length
        ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
        : null
      const successfulApps = applications.filter(application =>
        ['accepted', 'completed'].includes(application.status)
      ).length
      const decidedApps = applications.filter(application =>
        ['accepted', 'completed', 'declined', 'rejected'].includes(application.status)
      ).length

      if (active) {
        setStats({
          profile,
          totalPosted: postedGigs.length,
          openGigs: postedGigs.filter(gig => gig.status === 'open'
            && (!gig.expires_at || new Date(gig.expires_at).getTime() > Date.now())).length,
          totalApplied: applications.length,
          successfulApps,
          decidedApps,
          totalReviews: reviews.length,
          avgRating,
          earnedByCurrency: Object.entries(earnedByCurrency)
            .sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB)),
        })
        setLoading(false)
      }
    }
    fetchStats().catch(error => {
      console.error('Could not load My Stats:', error)
      if (active) {
        setLoadError('We couldn’t load your stats. Please try again.')
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [user?.id, retryKey])

  if (loading) return <ScreenLoader />

  const completed = Number(stats?.profile?.gigs_completed || 0)
  const completionMilestoneTarget = 1000
  const milestoneCompleted = Math.min(Math.max(Number(stats?.successfulApps || 0), 0), completionMilestoneTarget)
  const milestoneProgress = Math.round((milestoneCompleted / completionMilestoneTarget) * 100)
  const currentLevel = [...LEVELS].reverse().find(level => completed >= level.min) || LEVELS[0]
  const currentLevelIndex = LEVELS.findIndex(level => level.key === currentLevel.key)
  const nextLevel = LEVELS[currentLevelIndex + 1] || null
  const progress = nextLevel
    ? Math.min(100, Math.max(0, Math.floor(
      ((completed - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100
    )))
    : 100

  if (loadError) {
    return (
      <div className="stats-page">
        <div style={{ color: 'var(--color-text)', fontWeight: 700, marginBottom: 8 }}>My Stats</div>
        <div role="alert" style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{loadError}</div>
        <button type="button" onClick={() => setRetryKey(value => value + 1)} style={{
          marginTop: 12, padding: '9px 14px', border: 0, borderRadius: 9,
          color: 'white', background: 'var(--color-brand)', fontWeight: 700, cursor: 'pointer'
        }}>Try again</button>
      </div>
    )
  }

  return (
    <div className="stats-page">
      <div style={{
        fontSize: '22px', fontWeight: '800',
        color: 'var(--color-text)', marginBottom: '4px'
      }}>My Stats</div>
      <div style={{
        fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px'
      }}>Your Prima performance overview</div>

      <div className="stats-overview-grid">
      {/* Trust Score Hero */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-mid) 50%, var(--color-brand-highlight) 100%)',
        borderRadius: '20px', padding: '24px',
        color: 'var(--color-surface)', marginBottom: '16px', textAlign: 'center'
      }}>
        <div style={{
          fontSize: '12px', opacity: 0.8,
          letterSpacing: '1.5px', textTransform: 'uppercase',
          marginBottom: '8px'
        }}>Trust Score</div>
        <div style={{
          fontSize: '56px', fontWeight: '800',
          letterSpacing: '-2px', marginBottom: '4px'
        }}>
          {stats?.profile?.trust_score ?? 0}%
        </div>
        <div style={{ fontSize: '13px', opacity: 0.8 }}>
          {stats?.profile?.trust_score == null || stats?.profile?.trust_score === 0
            ? '🌱 New — Complete gigs to build your score'
            : stats?.profile?.trust_score >= 95
              ? '🏆 Excellent — Top Tier'
              : stats?.profile?.trust_score >= 80
                ? '👍 Good Standing'
                : '⚠️ Needs Improvement'}
        </div>
      </div>

      {/* Level Card */}
      <div style={{
        background: currentLevel.bg,
        border: `1.5px solid ${currentLevel.border}`,
        borderRadius: '16px', padding: '18px',
        marginBottom: '16px'
      }}>
        <div style={{
          display: 'flex', gap: '12px',
          alignItems: 'center', marginBottom: '14px'
        }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'var(--color-surface)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', flexShrink: 0,
            boxShadow: `0 4px 16px ${currentLevel.color}33`
          }}>{currentLevel.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '12px', color: currentLevel.color,
              fontWeight: '700', textTransform: 'uppercase',
              letterSpacing: '1px', marginBottom: '3px'
            }}>Current Level</div>
            <div style={{
              fontSize: '20px', fontWeight: '800', color: 'var(--color-text)'
            }}>{currentLevel.label}</div>
            <div style={{
              fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px'
            }}>{currentLevel.desc}</div>
          </div>
          <div style={{
            background: currentLevel.color, color: 'var(--color-surface)',
            borderRadius: '10px', padding: '6px 12px',
            fontSize: '13px', fontWeight: '800', flexShrink: 0
          }}>{completed} gigs</div>
        </div>

        {nextLevel ? (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px'
            }}>
              <span>Progress to {nextLevel.label}</span>
              <span style={{ fontWeight: '700', color: currentLevel.color }}>
                {progress}%
              </span>
            </div>
            <div style={{
              height: '8px', background: 'rgba(255,255,255,0.6)',
              borderRadius: '4px', overflow: 'hidden', marginBottom: '8px'
            }}>
              <div style={{
                height: '100%', borderRadius: '4px',
                width: `${progress}%`,
                background: currentLevel.color,
                transition: 'width 0.8s ease'
              }} />
            </div>
            <div style={{
              fontSize: '12px', color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <span>{nextLevel.icon}</span>
              <span>
                {nextLevel.min - completed > 0
                  ? `${nextLevel.min - completed} more gigs to reach ${nextLevel.label}`
                  : `Ready to level up to ${nextLevel.label}!`}
              </span>
            </div>
          </>
        ) : (
          <div style={{
            background: 'rgba(255,184,0,0.15)',
            borderRadius: '10px', padding: '10px 14px',
            fontSize: '12px', color: 'var(--color-warning-gold)',
            fontWeight: '600', textAlign: 'center'
          }}>
            🏆 You've reached the highest level!
          </div>
        )}
      </div>

      </div>

      {/* Stats Grid */}
      <div className="stats-metrics-grid">
        {[
          {
            label: 'Completed Gig Value',
            value: stats?.earnedByCurrency?.length
              ? stats.earnedByCurrency.map(([code, amount]) => `${code} ${Number(amount).toLocaleString()}`).join(' · ')
              : '—',
            color: 'var(--color-success)', icon: 'pay',
          },
          { label: 'Gigs Completed', value: completed, color: 'var(--color-brand)', icon: 'completed' },
          { label: 'Avg Rating', value: stats?.avgRating ? `${stats.avgRating}★` : '—', color: 'var(--color-warning-gold)', icon: 'rating' },
          { label: 'Reviews', value: stats?.totalReviews || 0, color: 'var(--color-brand-highlight)', icon: 'reviews' },
          { label: 'Gigs Posted', value: stats?.totalPosted || 0, color: 'var(--color-warning)', icon: 'mygigs' },
          { label: 'Open Gigs', value: stats?.openGigs || 0, color: 'var(--color-info)', icon: 'open' },
          { label: 'Applied To', value: stats?.totalApplied || 0, color: 'var(--color-info)', icon: 'applied' },
          { label: 'Successful Applications', value: stats?.successfulApps || 0, color: 'var(--color-success)', icon: 'accepted' },
          { label: 'Prima Credits', value: credits?.balance == null ? '—' : Number(credits.balance).toLocaleString(), color: 'var(--color-warning-gold)', icon: '⭐' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{
            background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
            borderRadius: '14px', padding: '14px', minWidth: 0
          }}>
            <div style={{ marginBottom: '8px', fontSize: icon.length <= 2 ? '22px' : undefined }}>
              {icon.length <= 2 ? icon : <BrandIcon name={icon} size={30} />}
            </div>
            <div style={{
              fontSize: label === 'Completed Gig Value' ? '15px' : '20px',
              fontWeight: '800', color, marginBottom: '3px', overflowWrap: 'anywhere', lineHeight: 1.25
            }}>{value}</div>
            <div style={{
              fontSize: '12px', color: 'var(--color-text-subtle)',
              fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Successful-application milestone uses the existing progress card. */}
      <div style={{
          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
          borderRadius: '14px', padding: '16px', marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700', color: 'var(--color-text)',
            marginBottom: '10px'
          }}>Successful Applications Progress</div>
          <div style={{
            height: '8px', background: 'var(--color-page)',
            borderRadius: '4px', overflow: 'hidden', marginBottom: '6px'
          }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              background: 'linear-gradient(90deg, var(--color-brand), var(--color-brand-highlight))',
              width: `${milestoneProgress}%`,
              transition: 'width 0.8s ease'
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: '12px',
            fontSize: '12px', color: 'var(--color-text-muted)'
          }}>
            <span>{milestoneCompleted >= completionMilestoneTarget
              ? `${milestoneCompleted.toLocaleString()} successful applications · milestone reached`
              : `${milestoneCompleted.toLocaleString()} / ${completionMilestoneTarget.toLocaleString()} successful applications`}</span>
            <span style={{ fontWeight: '700', color: 'var(--color-brand)', flexShrink: 0 }}>
              {milestoneProgress}%
            </span>
          </div>
        </div>
      {/* Level Roadmap */}
      <div style={{
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        borderRadius: '16px', padding: '18px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: 'var(--color-text)', marginBottom: '16px'
        }}>Level Roadmap</div>
        {LEVELS.map((lvl, i) => {
          const isActive = lvl.key === currentLevel.key
          const isDone = LEVELS.findIndex(l => l.key === currentLevel.key) > i
          return (
            <div key={lvl.key} style={{
              display: 'flex', gap: '12px',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < LEVELS.length - 1 ? '1px solid var(--color-page)' : 'none'
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: isActive || isDone ? lvl.bg : 'var(--color-page)',
                border: `1.5px solid ${isActive || isDone ? lvl.border : 'var(--color-border)'}`,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0
              }}>
                <BrandIcon name={lvl.brandIcon} size={28} active={isActive || isDone} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? lvl.color : isDone ? 'var(--color-text)' : 'var(--color-text-subtle)'
                  }}>{lvl.label}</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                    {lvl.min}+ gigs
                  </span>
                </div>
                <div style={{
                  fontSize: '12px', color: 'var(--color-text-subtle)', marginTop: '2px'
                }}>{lvl.desc}</div>
                {isActive && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    gap: '4px', marginTop: '4px',
                    background: lvl.bg, border: `1px solid ${lvl.border}`,
                    borderRadius: '20px', padding: '2px 8px',
                    fontSize: '12px', fontWeight: '700', color: lvl.color
                  }}>
                    ← You are here
                  </div>
                )}
              </div>
              {isDone && (
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '12px',
                  flexShrink: 0
                }}>✓</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
