import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import BrandIcon from '../BrandIcon'

export default function StatsScreen() {
  const { user } = useAuth()
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

    const avgRating = reviews?.length
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : '5.0'

    setStats({
      profile,
      totalPosted: postedGigs?.length || 0,
      openGigs: postedGigs?.filter(g => g.status === 'open').length || 0,
      completedGigs: postedGigs?.filter(g => g.status === 'completed').length || 0,
      totalApplied: applications?.length || 0,
      acceptedApps: applications?.filter(a => a.status === 'accepted').length || 0,
      totalReviews: reviews?.length || 0,
      avgRating,
    })
    setLoading(false)
  }

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '60px',
      color: '#A09DC8', fontSize: '14px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>Loading stats...</div>
  )

  return (
    <div style={{
      padding: '24px 20px 100px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ fontSize: '22px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
        My Stats
      </div>
      <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '24px' }}>
        Your Prima performance overview
      </div>

      {/* Trust Score Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #6C47FF 0%, #9B59FF 50%, #FF4DCF 100%)',
        borderRadius: '20px', padding: '24px',
        color: '#fff', marginBottom: '16px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '11px', opacity: 0.8, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
          Trust Score
        </div>
        <div style={{ fontSize: '56px', fontWeight: '800', letterSpacing: '-2px', marginBottom: '4px' }}>
          {stats?.profile?.trust_score || 100}%
        </div>
        <div style={{ fontSize: '13px', opacity: 0.8 }}>
          {stats?.profile?.trust_score >= 95 ? '🏆 Excellent — Top Tier'
            : stats?.profile?.trust_score >= 80 ? '👍 Good Standing'
              : '⚠️ Needs Improvement'}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '10px', marginBottom: '16px'
      }}>
        {[
          ['Gigs Posted', stats?.totalPosted, '#6C47FF', 'mygigs'],
          ['Open Now', stats?.openGigs, '#00C48C', 'open'],
          ['Completed', stats?.completedGigs, '#FF6B2B', 'completed'],
          ['Applied To', stats?.totalApplied, '#0EA5E9', 'applied'],
          ['Accepted', stats?.acceptedApps, '#00C48C', 'accepted'],
          ['Avg Rating', stats?.avgRating + '★', '#FFB800', 'rating'],
          ['Reviews', stats?.totalReviews, '#FF4DCF', 'reviews'],
          ['Level', stats?.profile?.level || 'New', '#6C47FF', 'level'],
        ].map(([label, val, color, icon]) => (
          <div key={label} style={{
            background: '#fff', border: '1.5px solid #E2E0FF',
            borderRadius: '14px', padding: '14px'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <BrandIcon name={icon} size={30} />
            </div>
            <div style={{
              fontSize: '20px', fontWeight: '800',
              color, marginBottom: '3px',
              fontFamily: "'JetBrains Mono', monospace"
            }}>{val}</div>
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

      {/* Level Progress */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E0FF',
        borderRadius: '14px', padding: '16px'
      }}>
        <div style={{
          fontSize: '12px', fontWeight: '700',
          color: '#14123A', marginBottom: '14px'
        }}>Worker Level</div>
        {[
          { level: 'New Member', min: 0, icon: 'profile', color: '#8B8FAF' },
          { level: 'Rising', min: 3, icon: 'open', color: '#00C48C' },
          { level: 'Pro', min: 10, icon: 'accepted', color: '#6C47FF' },
          { level: 'Elite', min: 25, icon: 'level', color: '#FFB800' },
        ].map((lvl, i) => {
          const completed = stats?.completedGigs || 0
          const isActive = i === [0,3,10,25].filter(m => completed >= m).length - 1
          const isDone = completed >= lvl.min
          return (
            <div key={lvl.level} style={{
              display: 'flex', gap: '12px',
              alignItems: 'center', marginBottom: '10px'
            }}>
              <BrandIcon name={lvl.icon} size={36} active={isDone} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: '13px', fontWeight: isActive ? '700' : '500',
                    color: isDone ? lvl.color : '#A09DC8'
                  }}>{lvl.level}</span>
                  <span style={{ fontSize: '11px', color: '#A09DC8' }}>
                    {lvl.min} gigs
                  </span>
                </div>
                {isActive && (
                  <div style={{ fontSize: '10px', color: '#8B8FAF', marginTop: '2px' }}>
                    ← You are here
                  </div>
                )}
              </div>
              {isDone && (
                <span style={{
                  fontSize: '14px', color: lvl.color
                }}>✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
