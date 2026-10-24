import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import PublicProfile from './PublicProfile'
import BrandIcon from './BrandIcon'
import { getCurrency } from '../data/currencies'

const RECENT_KEY = 'prima_recent_searches'

const TRENDING = [
  'Photographer Lagos',
  'React Developer',
  'Event Planner',
  'Graphic Designer',
  'Electrician',
  'Content Creator',
  'Moving Help',
  'UI/UX Designer',
]

const QUICK_FILTERS = [
  { label: 'Physical', icon: 'physical', key: 'type', value: 'physical' },
  { label: 'Digital', icon: 'digital', key: 'type', value: 'digital' },
  { label: 'Urgent now', icon: 'open', key: 'urgency', value: 'now' },
  { label: 'Today', icon: 'calendar', key: 'urgency', value: 'today' },
  { label: 'High pay', icon: 'pay', key: 'pay', value: 'high' },
]

export default function Search({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ gigs: [], users: [] })
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [activeFilters, setActiveFilters] = useState({})
  const [recentSearches, setRecentSearches] = useState([])
  const [viewingProfile, setViewingProfile] = useState(null)
  const [selectedGig, setSelectedGig] = useState(null)
  const inputRef = useRef()
  const debounceRef = useRef()
  const searchRunRef = useRef(0)

  useEffect(() => {
    // Focus input on open
    setTimeout(() => inputRef.current?.focus(), 100)
    // Load recent searches
    try {
      const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      setRecentSearches(recent)
    } catch (e) {}
  }, [])

  useEffect(() => {
    const runId = ++searchRunRef.current
    if (query.trim().length < 2) {
      setResults({ gigs: [], users: [] })
      setSearchError('')
      setLoading(false)
      return
    }
    clearTimeout(debounceRef.current)
    setLoading(true)
    setSearchError('')
    debounceRef.current = setTimeout(() => {
      performSearch(query, activeFilters, runId)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, activeFilters])

  const performSearch = async (q, filters, runId) => {
    try {
      // Build gigs query
      let gigsQuery = supabase
        .from('gigs')
        // gigs references users as both poster and worker; make the joined
        // profile explicit so PostgREST does not reject the relationship as
        // ambiguous (HTTP 300).
        .select('*, users!gigs_poster_id_fkey(full_name, avatar_url, trust_score, rating)')
        .eq('status', 'open')
        .is('deleted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .textSearch('search_vector', q.trim(), {
          type: 'websearch', config: 'simple'
        })

      if (filters.type) gigsQuery = gigsQuery.eq('type', filters.type)
      if (filters.urgency) gigsQuery = gigsQuery.eq('urgency', filters.urgency)
      if (filters.pay === 'high') gigsQuery = gigsQuery.order('pay_min', { ascending: false })
      gigsQuery = gigsQuery.order('created_at', { ascending: false }).limit(20)

      // Build users query
      let usersQuery = supabase
        .from('users')
        .select('id, full_name, username, avatar_url, rating, trust_score, skills')
        .textSearch('search_vector', q.trim(), {
          type: 'websearch', config: 'simple'
        })
        .limit(10)

      const [gigsResult, usersResult] = await Promise.all([gigsQuery, usersQuery])
      if (gigsResult.error) throw gigsResult.error
      if (usersResult.error) throw usersResult.error

      if (runId === searchRunRef.current) {
        setResults({ gigs: gigsResult.data || [], users: usersResult.data || [] })
        setSearchError('')
      }
    } catch (e) {
      console.log('Search error:', e)
      if (runId === searchRunRef.current) {
        setResults({ gigs: [], users: [] })
        setSearchError('Search is temporarily unavailable. Please try again.')
      }
    } finally {
      if (runId === searchRunRef.current) setLoading(false)
    }
  }

  const saveRecentSearch = (q) => {
    if (!q.trim()) return
    try {
      const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      const updated = [q, ...recent.filter(r => r !== q)].slice(0, 8)
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
      setRecentSearches(updated)
    } catch (e) {}
  }

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY)
    setRecentSearches([])
  }

  const toggleFilter = (filter) => {
    setActiveFilters(prev => {
      const updated = { ...prev }
      if (updated[filter.key] === filter.value) {
        delete updated[filter.key]
      } else {
        updated[filter.key] = filter.value
      }
      return updated
    })
  }

  const totalResults = results.gigs.length + results.users.length

  const displayGigs = activeTab === 'people' ? [] : results.gigs
  const displayUsers = activeTab === 'gigs' ? [] : results.users

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,18,58,0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }} onClick={onClose}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: 'var(--color-surface)',
            borderRadius: '0 0 24px 24px',
            boxShadow: '0 20px 60px rgba(108,71,255,0.2)',
            maxHeight: '90vh', overflowY: 'auto',
            animation: 'searchDrop 0.25s cubic-bezier(0.16,1,0.3,1)'
          }}>

          {/* Search Input Bar */}
          <div style={{
            padding: '16px 20px',
            display: 'flex', gap: '12px',
            alignItems: 'center',
            borderBottom: '1.5px solid var(--color-border)',
            position: 'sticky', top: 0,
            background: 'var(--color-surface)', zIndex: 10
          }}>
            <div style={{
              flex: 1, display: 'flex',
              alignItems: 'center', gap: '10px',
              background: 'var(--color-page)',
              border: '1.5px solid var(--color-border)',
              borderRadius: '14px', padding: '10px 14px',
              transition: 'border-color 0.15s'
            }}
            >
              <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                <BrandIcon name="search" size={32} />
              </span>
              <input
                ref={inputRef}
                className="search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && query.trim()) {
                    saveRecentSearch(query.trim())
                  }
                  if (e.key === 'Escape') onClose()
                }}
                placeholder="Search gigs, skills, people, locations..."
                style={{
                  flex: 1, background: 'none', border: 'none',
                  outline: 'none', fontSize: '15px',
                  color: 'var(--color-text)', fontFamily: 'inherit'
                }}
              />
              {query && (
                <span
                  onClick={() => setQuery('')}
                  style={{
                    fontSize: '18px', color: 'var(--color-text-subtle)',
                    cursor: 'pointer', flexShrink: 0
                  }}>×</span>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '13px', fontWeight: '600',
                color: 'var(--color-text-muted)', cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}>Cancel</button>
          </div>

          {/* Quick Filters */}
          <div style={{
            padding: '12px 20px',
            display: 'flex', gap: '8px',
            overflowX: 'auto', scrollbarWidth: 'none',
            borderBottom: '1px solid var(--color-page)'
          }}>
            {QUICK_FILTERS.map(filter => {
              const active = activeFilters[filter.key] === filter.value
              return (
                <button
                  key={filter.label}
                  onClick={() => toggleFilter(filter)}
                  style={{
                    background: active ? 'var(--color-brand-soft)' : 'transparent',
                    border: `1.5px solid ${active ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                    borderRadius: '20px', padding: '6px 13px',
                    fontSize: '12px', fontWeight: '600',
                    color: active ? 'var(--color-brand)' : 'var(--color-text-muted)',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: 'inherit', transition: 'all 0.15s'
                  }}>
                  <BrandIcon name={filter.icon} size={20} active={active} />
                  {filter.label}
                </button>
              )
            })}
          </div>

          {/* No query — show recent + trending */}
          {!query.trim() && (
            <div style={{ padding: '20px' }}>
              {recentSearches.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '12px'
                  }}>
                    <div style={{
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                      textTransform: 'uppercase', letterSpacing: '1px'
                    }}>Recent Searches</div>
                    <button
                      onClick={clearRecent}
                      style={{
                        background: 'none', border: 'none',
                        fontSize: '12px', color: 'var(--color-brand)',
                        fontWeight: '600', cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}>Clear all</button>
                  </div>
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '2px'
                  }}>
                    {recentSearches.map((search, i) => (
                      <div
                        key={i}
                        onClick={() => setQuery(search)}
                        style={{
                          display: 'flex', gap: '10px',
                          alignItems: 'center', padding: '10px 12px',
                          borderRadius: '10px', cursor: 'pointer',
                          transition: 'background 0.1s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <BrandIcon name="open" size={20} active={false} />
                        <span style={{ fontSize: '14px', color: 'var(--color-text)', flex: 1 }}>
                          {search}
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = recentSearches.filter((_, j) => j !== i)
                            setRecentSearches(updated)
                            localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
                          }}
                          style={{ fontSize: '16px', color: 'var(--color-text-subtle)', cursor: 'pointer' }}>
                          ×
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending */}
              <div>
                <div style={{
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '12px'
                }}>Trending Searches</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TRENDING.map(t => (
                    <button
                      key={t}
                      onClick={() => { setQuery(t); saveRecentSearch(t) }}
                      style={{
                        background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                        borderRadius: '20px', padding: '8px 14px',
                        fontSize: '13px', fontWeight: '500',
                        color: 'var(--color-text-muted)', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--color-brand-soft)'
                        e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
                        e.currentTarget.style.color = 'var(--color-brand)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--color-page)'
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                        e.currentTarget.style.color = 'var(--color-text-muted)'
                      }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {query.trim().length === 1 && (
            <div style={{ padding: '18px 20px', color: 'var(--color-text-subtle)', fontSize: '13px' }}>
              Type at least 2 characters to search.
            </div>
          )}

          {/* Has query — show results */}
          {query.trim().length >= 2 && (
            <div style={{ padding: '0 20px 20px' }}>

              {/* Result count + tabs */}
              {!loading && totalResults > 0 && (
                <div style={{
                  display: 'flex', gap: '4px',
                  padding: '12px 0', alignItems: 'center'
                }}>
                  <span style={{
                    fontSize: '12px', color: 'var(--color-text-muted)',
                    marginRight: '8px'
                  }}>
                    {totalResults} result{totalResults !== 1 ? 's' : ''}
                  </span>
                  {['all', 'gigs', 'people'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: activeTab === tab ? 'var(--color-brand)' : 'transparent',
                        border: `1.5px solid ${activeTab === tab ? 'var(--color-brand)' : 'var(--color-border)'}`,
                        borderRadius: '20px', padding: '5px 13px',
                        fontSize: '12px', fontWeight: '600',
                        color: activeTab === tab ? 'var(--color-surface)' : 'var(--color-text-muted)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'capitalize'
                      }}>
                      {tab === 'all'
                        ? `All (${totalResults})`
                        : tab === 'gigs'
                          ? `Gigs (${results.gigs.length})`
                          : `People (${results.users.length})`}
                    </button>
                  ))}
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div style={{
                  textAlign: 'center', padding: '32px',
                  color: 'var(--color-text-subtle)', fontSize: '14px'
                }}>
                  <span className="search-loading-spinner" aria-hidden="true" />
                  Searching...
                </div>
              )}

              {!loading && searchError && (
                <div role="alert" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--color-danger)', fontSize: '14px' }}>
                  {searchError}
                </div>
              )}

              {/* No results */}
              {!loading && !searchError && query.trim().length >= 2 && totalResults === 0 && (
                <div style={{
                  textAlign: 'center', padding: '48px 20px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '14px'
                  }}>
                    <BrandIcon name="search" size={60} />
                  </div>
                  <div style={{
                    fontSize: '16px', fontWeight: '700',
                    color: 'var(--color-text)', marginBottom: '6px'
                  }}>No results for "{query}"</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-subtle)', marginBottom: '20px' }}>
                    Try different keywords or check the spelling
                  </div>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px'
                  }}>Try searching for:</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {TRENDING.slice(0, 4).map(t => (
                      <button
                        key={t}
                        onClick={() => setQuery(t)}
                        style={{
                          background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                          borderRadius: '20px', padding: '6px 12px',
                          fontSize: '12px', fontWeight: '600',
                          color: 'var(--color-brand)', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>{t}</button>
                    ))}
                  </div>
                </div>
              )}

              {!loading && !searchError && activeTab === 'gigs' && results.gigs.length === 0 && totalResults > 0 && (
                <div style={{ padding: '28px 16px', color: 'var(--color-text-subtle)', fontSize: '13px', textAlign: 'center' }}>
                  No matching gigs. Try the People tab or adjust your filters.
                </div>
              )}
              {!loading && !searchError && activeTab === 'people' && results.users.length === 0 && totalResults > 0 && (
                <div style={{ padding: '28px 16px', color: 'var(--color-text-subtle)', fontSize: '13px', textAlign: 'center' }}>
                  No matching people. Try the Gigs tab or adjust your filters.
                </div>
              )}

              {/* Gig Results */}
              {!loading && displayGigs.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  {activeTab === 'all' && (
                    <div style={{
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                      textTransform: 'uppercase', letterSpacing: '1px',
                      marginBottom: '10px', marginTop: '8px'
                    }}>Gigs ({results.gigs.length})</div>
                  )}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px'
                  }}>
                    {displayGigs.map(gig => (
                      <div
                        key={gig.id}
                        onClick={() => {
                          saveRecentSearch(query)
                          setSelectedGig(gig)
                        }}
                        style={{
                          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                          borderRadius: '14px', padding: '14px',
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,71,255,0.1)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', marginBottom: '8px'
                        }}>
                          <div style={{ flex: 1, paddingRight: '10px' }}>
                            <div style={{
                              display: 'flex', gap: '5px',
                              flexWrap: 'wrap', marginBottom: '5px'
                            }}>
                              <span style={{
                                background: gig.urgency === 'now' ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)',
                                border: `1px solid ${gig.urgency === 'now' ? 'var(--color-danger-border)' : 'var(--color-warning-border)'}`,
                                borderRadius: '4px', padding: '1px 7px',
                                fontSize: '12px', fontWeight: '800',
                                color: gig.urgency === 'now' ? 'var(--color-danger)' : 'var(--color-warning)',
                                letterSpacing: '0.8px'
                              }}>
                                {gig.urgency?.toUpperCase()}
                              </span>
                              <span style={{
                                background: gig.type === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)',
                                border: `1px solid ${gig.type === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)'}`,
                                borderRadius: '4px', padding: '1px 7px',
                                fontSize: '12px', fontWeight: '700',
                                color: gig.type === 'physical' ? 'var(--color-warning)' : 'var(--color-brand)'
                              }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <BrandIcon name={gig.type === 'physical' ? 'physical' : 'digital'} size={18} active={false} />
                                  {gig.type === 'physical' ? 'LOCAL' : 'REMOTE'}
                                </span>
                              </span>
                              {gig.field && (
                                <span style={{
                                  background: 'var(--color-page)', border: '1px solid var(--color-border)',
                                  borderRadius: '4px', padding: '1px 7px',
                                  fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)'
                                }}>{gig.field}</span>
                              )}
                            </div>
                            <div style={{
                              fontSize: '14px', fontWeight: '700', color: 'var(--color-text)'
                            }}>{gig.title}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: '16px', fontWeight: '800', color: 'var(--color-success)'
                            }}>{getCurrency(gig.currency || 'USD').symbol}{gig.pay_min}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                              –{getCurrency(gig.currency || 'USD').symbol}{gig.pay_max}
                            </div>
                          </div>
                        </div>

                        <div style={{
                          display: 'flex', gap: '8px', alignItems: 'center'
                        }}>
                          <div style={{
                            width: '26px', height: '26px', borderRadius: '7px',
                            background: 'var(--color-brand-soft)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: '800',
                            color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0
                          }}>
                            {gig.users?.avatar_url ? (
                              <img src={gig.users.avatar_url} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : gig.users?.full_name?.charAt(0) || '?'}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {gig.users?.full_name || 'Anonymous'}
                          </span>
                          {gig.location && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--color-warning)' }}>
                              <BrandIcon name="location" size={18} active={false} /> {gig.location}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* People Results */}
              {!loading && displayUsers.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div style={{
                      fontSize: '12px', fontWeight: '700', color: 'var(--color-text-subtle)',
                      textTransform: 'uppercase', letterSpacing: '1px',
                      marginBottom: '10px'
                    }}>People ({results.users.length})</div>
                  )}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px'
                  }}>
                    {displayUsers.map(person => (
                      <div
                        key={person.id}
                        onClick={() => {
                          saveRecentSearch(query)
                          setViewingProfile(person.id)
                        }}
                        style={{
                          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                          borderRadius: '14px', padding: '14px',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', gap: '12px', alignItems: 'center'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--color-brand-border-strong)'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,71,255,0.1)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}>
                        <div style={{
                          width: '48px', height: '48px', borderRadius: '13px',
                          background: 'var(--color-brand-soft)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '18px', fontWeight: '800',
                          color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0,
                          border: '1.5px solid var(--color-brand-border-strong)'
                        }}>
                          {person.avatar_url ? (
                            <img src={person.avatar_url} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : person.full_name?.charAt(0) || '?'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '14px', fontWeight: '700',
                            color: 'var(--color-text)', marginBottom: '2px'
                          }}>{person.full_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                            @{person.username} · <BrandIcon name="rating" size={16} active={false} /> {person.rating || 5.0} · Trust {person.trust_score || 100}%
                          </div>
                          {person.skills && person.skills.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {person.skills.slice(0, 3).map(skill => (
                                <span key={skill} style={{
                                  background: 'var(--color-brand-soft)', borderRadius: '20px',
                                  padding: '2px 8px', fontSize: '12px',
                                  fontWeight: '600', color: 'var(--color-brand)'
                                }}>{skill}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{
                          background: 'var(--color-brand-soft)', borderRadius: '9px',
                          padding: '6px 10px', textAlign: 'center',
                          flexShrink: 0
                        }}>
                          <div style={{
                            fontSize: '13px', fontWeight: '800', color: 'var(--color-brand)'
                          }}>{person.trust_score || 100}%</div>
                          <div style={{
                            fontSize: '12px', color: 'var(--color-text-subtle)',
                            fontWeight: '600', letterSpacing: '0.3px'
                          }}>TRUST</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Gig Detail Sheet */}
      {selectedGig && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,58,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }} onClick={() => setSelectedGig(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-surface)',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '88vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: 'var(--color-border)', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />

            <div style={{
              display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px'
            }}>
              <span style={{
                background: 'var(--color-warning-soft)', border: '1px solid var(--color-warning-border)',
                borderRadius: '6px', padding: '3px 9px',
                fontSize: '12px', fontWeight: '800', color: 'var(--color-warning)'
              }}>{selectedGig.urgency?.toUpperCase()}</span>
              <span style={{
                background: selectedGig.type === 'physical' ? 'var(--color-warning-soft)' : 'var(--color-brand-soft)',
                border: `1px solid ${selectedGig.type === 'physical' ? 'var(--color-warning-border)' : 'var(--color-brand-border-strong)'}`,
                borderRadius: '6px', padding: '3px 9px',
                fontSize: '12px', fontWeight: '700',
                color: selectedGig.type === 'physical' ? 'var(--color-warning)' : 'var(--color-brand)'
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <BrandIcon name={selectedGig.type === 'physical' ? 'physical' : 'digital'} size={18} active={false} />
                  {selectedGig.type === 'physical' ? 'PHYSICAL' : 'DIGITAL'}
                </span>
              </span>
            </div>

            <h2 style={{
              fontSize: '20px', fontWeight: '800',
              color: 'var(--color-text)', marginBottom: '16px'
            }}>{selectedGig.title}</h2>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '10px', marginBottom: '14px'
            }}>
              <div style={{
                background: 'var(--color-success-soft)', border: '1.5px solid var(--color-success-border)',
                borderRadius: '14px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '12px', color: 'var(--color-success)', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Pay Range</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800', color: 'var(--color-success)'
                }}>{getCurrency(selectedGig.currency || 'USD').symbol}{selectedGig.pay_min}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-success)', opacity: 0.7 }}>
                  up to {getCurrency(selectedGig.currency || 'USD').symbol}{selectedGig.pay_max}
                </div>
              </div>
              <div style={{
                background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning-border)',
                borderRadius: '14px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '12px', color: 'var(--color-warning)', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Location</div>
                <div style={{
                  fontSize: '13px', fontWeight: '700', color: 'var(--color-text)'
                }}>{selectedGig.location || 'Remote'}</div>
              </div>
            </div>

            {selectedGig.description && (
              <div style={{
                background: 'var(--color-page)', borderRadius: '12px',
                padding: '14px', marginBottom: '14px',
                fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.6'
              }}>{selectedGig.description}</div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSelectedGig(null)}
                style={{
                  flex: 1, background: 'var(--color-page)',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: '12px', padding: '14px',
                  fontSize: '13px', fontWeight: '600',
                  color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit'
                }}>Close</button>
              <button onClick={() => {
                const gigId = selectedGig.id
                saveRecentSearch(query)
                setSelectedGig(null)
                onClose?.()
                window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'feed' }))
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  window.dispatchEvent(new CustomEvent('openGigDetail', { detail: gigId }))
                }))
              }} style={{
                flex: 2,
                background: 'var(--color-brand-gradient)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700', color: 'var(--color-surface)',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
              }}>View Gig &amp; Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Public Profile */}
      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      <style>{`
        @keyframes searchDrop {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
