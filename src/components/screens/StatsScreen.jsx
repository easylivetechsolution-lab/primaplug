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
    color: '#8B8FAF',
    bg: '#F5F4FF',
    border: '#E2E0FF',
    min: 0,
    desc: 'Just getting started on Prima'
  },
  {
    key: 'rising',
    label: 'Rising',
    icon: '⚡',
    brandIcon: 'open',
    color: '#FF6B2B',
    bg: '#FFF0E8',
    border: '#FFBC99',
    min: 3,
    desc: 'Proving yourself — keep going!'
  },
  {
    key: 'pro',
    label: 'Pro',
    icon: '🎯',
    brandIcon: 'accepted',
    color: '#6C47FF',
    bg: '#EEE9FF',
    border: '#B8A5FF',
    min: 10,
    desc: 'Trusted by the community'
  },
  {
    key: 'elite',
    label: 'Elite',
    icon: '🏆',
    brandIcon: 'level',
    color: '#FFB800',
    bg: '#FFF8E0',
    border: '#FFD966',
    min: 25,
    desc: 'Top tier — the best of Prima'
  },
]

export default function StatsScreen() {
  const { user } = useAuth()
  const { credits } = useCredits()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [user])

  const fetchStats = async () => {
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    const { data: postedGigs } = await supabase
      .from('gigs')
      .select('id, status, pay_min, pay_max')
      .eq('poster_id', user.id)

    const { data: applications } = await supabase
      .from('applications')
      .select('id, status')
      .eq('worker_id', user.id)

    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('reviewee_id', user.id)

    const { data: receipts } = await supabase
      .from('receipts')
      .select('amount')
      .eq('worker_id', user.id)
      .eq('completed', true)

    const totalEarned = receipts?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0
    const avgRating = reviews?.length
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null

    setStats({
      profile,
      totalPosted: postedGigs?.length || 0,
      openGigs: postedGigs?.filter(g => g.status === 'open').length || 0,
      completedGigs: postedGigs?.filter(g => g.status === 'completed').length || 0,
      totalApplied: applications?.length || 0,
      acceptedApps: applications?.filter(a => a.status === 'accepted').length || 0,
      totalReviews: reviews?.length || 0,
      avgRating,
      totalEarned,
    })
    setLoading(false)
  }

  const getCurrentLevel = (profile) => {
    const level = profile?.level || 'new'
    return LEVELS.find(l => l.key === level) || LEVELS[0]
  }

  const getNextLevel = (profile) => {
    const current = getCurrentLevel(profile)
    const idx = LEVELS.findIndex(l => l.key === current.key)
    return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null
  }

  if (loading) return <ScreenLoader />

  const currentLevel = getCurrentLevel(stats?.profile)
  const nextLevel = getNextLevel(stats?.profile)
  const progress = stats?.profile?.level_progress || 0
  const completed = stats?.profile?.gigs_completed || 0

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        fontSize: '22px', fontWeight: '800',
        color: '#14123A', marginBottom: '4px'
      }}>My Stats</div>
      <div style={{
        fontSize: '13px', color: '#8B8FAF', marginBottom: '24px'
      }}>Your Prima performance overview</div>

      {/* Trust Score Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
        borderRadius: '20px', padding: '24px',
        color: '#fff', marginBottom: '16px', textAlign: 'center'
      }}>
        <div style={{
          fontSize: '11px', opacity: 0.8,
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
            background: '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', flexShrink: 0,
            boxShadow: `0 4px 16px ${currentLevel.color}33`
          }}>{currentLevel.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '10px', color: currentLevel.color,
              fontWeight: '700', textTransform: 'uppercase',
              letterSpacing: '1px', marginBottom: '3px'
            }}>Current Level</div>
            <div style={{
              fontSize: '20px', fontWeight: '800', color: '#14123A'
            }}>{currentLevel.label}</div>
            <div style={{
              fontSize: '11px', color: '#8B8FAF', marginTop: '2px'
            }}>{currentLevel.desc}</div>
          </div>
          <div style={{
            background: currentLevel.color, color: '#fff',
            borderRadius: '10px', padding: '6px 12px',
            fontSize: '13px', fontWeight: '800', flexShrink: 0
          }}>{completed} gigs</div>
        </div>

        {nextLevel ? (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '11px', color: '#8B8FAF', marginBottom: '6px'
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
              fontSize: '11px', color: '#8B8FAF',
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
            fontSize: '12px', color: '#FFB800',
            fontWeight: '600', textAlign: 'center'
          }}>
            🏆 You've reached the highest level!
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '10px', marginBottom: '16px'
      }}>
        {[
          { label: 'Total Earned', value: `$${stats?.totalEarned?.toFixed(0) || 0}`, color: '#00C48C', icon: 'pay' },
          { label: 'Gigs Completed', value: completed, color: '#6C47FF', icon: 'completed' },
          { label: 'Avg Rating', value: stats?.avgRating ? `${stats.avgRating}★` : '0.0★', color: '#FFB800', icon: 'rating' },
          { label: 'Reviews', value: stats?.totalReviews || 0, color: '#FF4DCF', icon: 'reviews' },
          { label: 'Gigs Posted', value: stats?.totalPosted || 0, color: '#FF6B2B', icon: 'mygigs' },
          { label: 'Applied To', value: stats?.totalApplied || 0, color: '#0EA5E9', icon: 'applied' },
          { label: 'Accepted', value: stats?.acceptedApps || 0, color: '#00C48C', icon: 'accepted' },
          { label: 'Trust Score', value: `${stats?.profile?.trust_score ?? 0}%`, color: '#6C47FF', icon: 'level' },
          { label: 'Prima Credits', value: credits?.balance?.toFixed(0) || 0, color: '#FFB800', icon: '⭐' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{
            background: '#fff', border: '1.5px solid #E2E0FF',
            borderRadius: '14px', padding: '14px'
          }}>
            <div style={{ marginBottom: '8px', fontSize: icon.length <= 2 ? '22px' : undefined }}>
              {icon.length <= 2
                ? icon
                : <BrandIcon name={icon} size={30} />}
            </div>
            <div style={{
              fontSize: '20px', fontWeight: '800',
              color, marginBottom: '3px'
            }}>{value}</div>
            <div style={{
              fontSize: '10px', color: '#A09DC8',
              fontWeight: '600', textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Acceptance Rate */}
      {stats?.totalApplied > 0 && (
        <div style={{
          background: '#fff', border: '1.5px solid #E2E0FF',
          borderRadius: '14px', padding: '16px', marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700', color: '#14123A',
            marginBottom: '10px'
          }}>Application Success Rate</div>
          <div style={{
            height: '8px', background: '#F5F4FF',
            borderRadius: '4px', overflow: 'hidden', marginBottom: '6px'
          }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              background: 'linear-gradient(90deg, #6C47FF, #FF4DCF)',
              width: `${Math.round((stats.acceptedApps / stats.totalApplied) * 100)}%`,
              transition: 'width 0.8s ease'
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '11px', color: '#8B8FAF'
          }}>
            <span>{stats.acceptedApps} accepted</span>
            <span style={{ fontWeight: '700', color: '#6C47FF' }}>
              {Math.round((stats.acceptedApps / stats.totalApplied) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Level Roadmap */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E0FF',
        borderRadius: '16px', padding: '18px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#14123A', marginBottom: '16px'
        }}>Level Roadmap</div>
        {LEVELS.map((lvl, i) => {
          const isActive = lvl.key === currentLevel.key
          const isDone = LEVELS.findIndex(l => l.key === currentLevel.key) > i
          return (
            <div key={lvl.key} style={{
              display: 'flex', gap: '12px',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < LEVELS.length - 1 ? '1px solid #F5F4FF' : 'none'
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: isActive || isDone ? lvl.bg : '#F5F4FF',
                border: `1.5px solid ${isActive || isDone ? lvl.border : '#E2E0FF'}`,
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
                    color: isActive ? lvl.color : isDone ? '#14123A' : '#A09DC8'
                  }}>{lvl.label}</span>
                  <span style={{ fontSize: '11px', color: '#A09DC8' }}>
                    {lvl.min}+ gigs
                  </span>
                </div>
                <div style={{
                  fontSize: '11px', color: '#A09DC8', marginTop: '2px'
                }}>{lvl.desc}</div>
                {isActive && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    gap: '4px', marginTop: '4px',
                    background: lvl.bg, border: `1px solid ${lvl.border}`,
                    borderRadius: '20px', padding: '2px 8px',
                    fontSize: '9px', fontWeight: '700', color: lvl.color
                  }}>
                    ← You are here
                  </div>
                )}
              </div>
              {isDone && (
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: '#DFFDF4', border: '1.5px solid #7EECD2',
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
