import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import PublicProfile from './PublicProfile'

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
  { label: '📌 Physical', key: 'type', value: 'physical' },
  { label: '💻 Digital', key: 'type', value: 'digital' },
  { label: '🔴 Urgent NOW', key: 'urgency', value: 'now' },
  { label: '📅 Today', key: 'urgency', value: 'today' },
  { label: '💰 High Pay', key: 'pay', value: 'high' },
]

export default function Search({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ gigs: [], users: [] })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [activeFilters, setActiveFilters] = useState({})
  const [recentSearches, setRecentSearches] = useState([])
  const [viewingProfile, setViewingProfile] = useState(null)
  const [selectedGig, setSelectedGig] = useState(null)
  const inputRef = useRef()
  const debounceRef = useRef()

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
    if (query.length < 2) {
      setResults({ gigs: [], users: [] })
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      performSearch(query)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, activeFilters])

  const performSearch = async (q) => {
    setLoading(true)
    try {
      // Build gigs query
      let gigsQuery = supabase
        .from('gigs')
        .select('*, users(full_name, avatar_url, trust_score, rating)')
        .eq('status', 'open')
        .textSearch('search_vector', q.trim().split(' ').join(' & '), {
          type: 'websearch'
        })
        .limit(20)

      if (activeFilters.type) gigsQuery = gigsQuery.eq('type', activeFilters.type)
      if (activeFilters.urgency) gigsQuery = gigsQuery.eq('urgency', activeFilters.urgency)
      if (activeFilters.pay === 'high') gigsQuery = gigsQuery.gte('pay_min', 100)

      // Build users query
      let usersQuery = supabase
        .from('users')
        .select('*')
        .textSearch('search_vector', q.trim().split(' ').join(' & '), {
          type: 'websearch'
        })
        .limit(10)

      const [gigsResult, usersResult] = await Promise.all([gigsQuery, usersQuery])

      setResults({
        gigs: gigsResult.data || [],
        users: usersResult.data || [],
      })
    } catch (e) {
      console.log('Search error:', e)
    }
    setLoading(false)
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
            background: '#fff',
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
            borderBottom: '1.5px solid #E2E0FF',
            position: 'sticky', top: 0,
            background: '#fff', zIndex: 10
          }}>
            <div style={{
              flex: 1, display: 'flex',
              alignItems: 'center', gap: '10px',
              background: '#F5F4FF',
              border: '1.5px solid #E2E0FF',
              borderRadius: '14px', padding: '10px 14px',
              transition: 'border-color 0.15s'
            }}
              onFocus={() => {}}
            >
              <span style={{ fontSize: '18px', flexShrink: 0 }}>
                {loading ? '⏳' : '🔍'}
              </span>
              <input
                ref={inputRef}
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
                  color: '#14123A', fontFamily: 'inherit'
                }}
              />
              {query && (
                <span
                  onClick={() => setQuery('')}
                  style={{
                    fontSize: '18px', color: '#A09DC8',
                    cursor: 'pointer', flexShrink: 0
                  }}>×</span>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '13px', fontWeight: '600',
                color: '#8B8FAF', cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}>Cancel</button>
          </div>

          {/* Quick Filters */}
          <div style={{
            padding: '12px 20px',
            display: 'flex', gap: '8px',
            overflowX: 'auto', scrollbarWidth: 'none',
            borderBottom: '1px solid #F5F4FF'
          }}>
            {QUICK_FILTERS.map(filter => {
              const active = activeFilters[filter.key] === filter.value
              return (
                <button
                  key={filter.label}
                  onClick={() => toggleFilter(filter)}
                  style={{
                    background: active ? '#EEE9FF' : 'transparent',
                    border: `1.5px solid ${active ? '#B8A5FF' : '#E2E0FF'}`,
                    borderRadius: '20px', padding: '6px 13px',
                    fontSize: '12px', fontWeight: '600',
                    color: active ? '#6C47FF' : '#8B8FAF',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: 'inherit', transition: 'all 0.15s'
                  }}>
                  {filter.label}
                </button>
              )
            })}
          </div>

          {/* No query — show recent + trending */}
          {!query && (
            <div style={{ padding: '20px' }}>
              {recentSearches.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '12px'
                  }}>
                    <div style={{
                      fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                      textTransform: 'uppercase', letterSpacing: '1px'
                    }}>Recent Searches</div>
                    <button
                      onClick={clearRecent}
                      style={{
                        background: 'none', border: 'none',
                        fontSize: '12px', color: '#6C47FF',
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
                        onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: '16px', color: '#A09DC8' }}>🕐</span>
                        <span style={{ fontSize: '14px', color: '#14123A', flex: 1 }}>
                          {search}
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = recentSearches.filter((_, j) => j !== i)
                            setRecentSearches(updated)
                            localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
                          }}
                          style={{ fontSize: '16px', color: '#A09DC8', cursor: 'pointer' }}>
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
                  fontSize: '11px', fontWeight: '700', color: '#A09DC8',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  marginBottom: '12px'
                }}>🔥 Trending Searches</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TRENDING.map(t => (
                    <button
                      key={t}
                      onClick={() => { setQuery(t); saveRecentSearch(t) }}
                      style={{
                        background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                        borderRadius: '20px', padding: '8px 14px',
                        fontSize: '13px', fontWeight: '500',
                        color: '#5B5887', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#EEE9FF'
                        e.currentTarget.style.borderColor = '#B8A5FF'
                        e.currentTarget.style.color = '#6C47FF'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#F5F4FF'
                        e.currentTarget.style.borderColor = '#E2E0FF'
                        e.currentTarget.style.color = '#5B5887'
                      }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Has query — show results */}
          {query.length >= 2 && (
            <div style={{ padding: '0 20px 20px' }}>

              {/* Result count + tabs */}
              {!loading && totalResults > 0 && (
                <div style={{
                  display: 'flex', gap: '4px',
                  padding: '12px 0', alignItems: 'center'
                }}>
                  <span style={{
                    fontSize: '12px', color: '#8B8FAF',
                    marginRight: '8px'
                  }}>
                    {totalResults} result{totalResults !== 1 ? 's' : ''}
                  </span>
                  {['all', 'gigs', 'people'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: activeTab === tab ? '#6C47FF' : 'transparent',
                        border: `1.5px solid ${activeTab === tab ? '#6C47FF' : '#E2E0FF'}`,
                        borderRadius: '20px', padding: '5px 13px',
                        fontSize: '12px', fontWeight: '600',
                        color: activeTab === tab ? '#fff' : '#8B8FAF',
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
                  color: '#A09DC8', fontSize: '14px'
                }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                  Searching...
                </div>
              )}

              {/* No results */}
              {!loading && query.length >= 2 && totalResults === 0 && (
                <div style={{
                  textAlign: 'center', padding: '48px 20px'
                }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
                  <div style={{
                    fontSize: '16px', fontWeight: '700',
                    color: '#14123A', marginBottom: '6px'
                  }}>No results for "{query}"</div>
                  <div style={{ fontSize: '13px', color: '#A09DC8', marginBottom: '20px' }}>
                    Try different keywords or check the spelling
                  </div>
                  <div style={{
                    fontSize: '12px', color: '#8B8FAF', marginBottom: '12px'
                  }}>Try searching for:</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {TRENDING.slice(0, 4).map(t => (
                      <button
                        key={t}
                        onClick={() => setQuery(t)}
                        style={{
                          background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                          borderRadius: '20px', padding: '6px 12px',
                          fontSize: '12px', fontWeight: '600',
                          color: '#6C47FF', cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}>{t}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Gig Results */}
              {!loading && displayGigs.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  {activeTab === 'all' && (
                    <div style={{
                      fontSize: '11px', fontWeight: '700', color: '#A09DC8',
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
                          background: '#fff', border: '1.5px solid #E2E0FF',
                          borderRadius: '14px', padding: '14px',
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#B8A5FF'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,71,255,0.1)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#E2E0FF'
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
                                background: gig.urgency === 'now' ? '#FFE8EE' : '#FFF0E8',
                                border: `1px solid ${gig.urgency === 'now' ? '#FF99B3' : '#FFBC99'}`,
                                borderRadius: '4px', padding: '1px 7px',
                                fontSize: '8px', fontWeight: '800',
                                color: gig.urgency === 'now' ? '#FF3366' : '#FF6B2B',
                                letterSpacing: '0.8px'
                              }}>
                                {gig.urgency?.toUpperCase()}
                              </span>
                              <span style={{
                                background: gig.type === 'physical' ? '#FFF0E8' : '#EEE9FF',
                                border: `1px solid ${gig.type === 'physical' ? '#FFBC99' : '#B8A5FF'}`,
                                borderRadius: '4px', padding: '1px 7px',
                                fontSize: '8px', fontWeight: '700',
                                color: gig.type === 'physical' ? '#FF6B2B' : '#6C47FF'
                              }}>
                                {gig.type === 'physical' ? '📌 LOCAL' : '💻 REMOTE'}
                              </span>
                              {gig.field && (
                                <span style={{
                                  background: '#F5F4FF', border: '1px solid #E2E0FF',
                                  borderRadius: '4px', padding: '1px 7px',
                                  fontSize: '8px', fontWeight: '600', color: '#8B8FAF'
                                }}>{gig.field}</span>
                              )}
                            </div>
                            <div style={{
                              fontSize: '14px', fontWeight: '700', color: '#14123A'
                            }}>{gig.title}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: '16px', fontWeight: '800', color: '#00C48C'
                            }}>${gig.pay_min}</div>
                            <div style={{ fontSize: '10px', color: '#A09DC8' }}>
                              –${gig.pay_max}
                            </div>
                          </div>
                        </div>

                        <div style={{
                          display: 'flex', gap: '8px', alignItems: 'center'
                        }}>
                          <div style={{
                            width: '26px', height: '26px', borderRadius: '7px',
                            background: '#EEE9FF', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: '800',
                            color: '#6C47FF', overflow: 'hidden', flexShrink: 0
                          }}>
                            {gig.users?.avatar_url ? (
                              <img src={gig.users.avatar_url} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : gig.users?.full_name?.charAt(0) || '?'}
                          </div>
                          <span style={{ fontSize: '11px', color: '#8B8FAF' }}>
                            {gig.users?.full_name || 'Anonymous'}
                          </span>
                          {gig.location && (
                            <span style={{ fontSize: '10px', color: '#FF6B2B' }}>
                              📍 {gig.location}
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
                      fontSize: '11px', fontWeight: '700', color: '#A09DC8',
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
                          background: '#fff', border: '1.5px solid #E2E0FF',
                          borderRadius: '14px', padding: '14px',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', gap: '12px', alignItems: 'center'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#B8A5FF'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,71,255,0.1)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#E2E0FF'
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}>
                        <div style={{
                          width: '48px', height: '48px', borderRadius: '13px',
                          background: '#EEE9FF', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '18px', fontWeight: '800',
                          color: '#6C47FF', overflow: 'hidden', flexShrink: 0,
                          border: '1.5px solid #B8A5FF'
                        }}>
                          {person.avatar_url ? (
                            <img src={person.avatar_url} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : person.full_name?.charAt(0) || '?'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '14px', fontWeight: '700',
                            color: '#14123A', marginBottom: '2px'
                          }}>{person.full_name}</div>
                          <div style={{ fontSize: '11px', color: '#8B8FAF', marginBottom: '4px' }}>
                            @{person.username} · ⭐ {person.rating || 5.0} · Trust {person.trust_score || 100}%
                          </div>
                          {person.skills && person.skills.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {person.skills.slice(0, 3).map(skill => (
                                <span key={skill} style={{
                                  background: '#EEE9FF', borderRadius: '20px',
                                  padding: '2px 8px', fontSize: '10px',
                                  fontWeight: '600', color: '#6C47FF'
                                }}>{skill}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{
                          background: '#EEE9FF', borderRadius: '9px',
                          padding: '6px 10px', textAlign: 'center',
                          flexShrink: 0
                        }}>
                          <div style={{
                            fontSize: '13px', fontWeight: '800', color: '#6C47FF'
                          }}>{person.trust_score || 100}%</div>
                          <div style={{
                            fontSize: '8px', color: '#A09DC8',
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
            background: '#fff',
            borderRadius: '22px 22px 0 0',
            padding: '24px', width: '100%',
            maxWidth: '640px', maxHeight: '88vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
          }}>
            <div style={{
              width: '40px', height: '4px',
              background: '#E2E0FF', borderRadius: '2px',
              margin: '0 auto 20px'
            }} />

            <div style={{
              display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px'
            }}>
              <span style={{
                background: '#FFF0E8', border: '1px solid #FFBC99',
                borderRadius: '6px', padding: '3px 9px',
                fontSize: '9px', fontWeight: '800', color: '#FF6B2B'
              }}>{selectedGig.urgency?.toUpperCase()}</span>
              <span style={{
                background: selectedGig.type === 'physical' ? '#FFF0E8' : '#EEE9FF',
                border: `1px solid ${selectedGig.type === 'physical' ? '#FFBC99' : '#B8A5FF'}`,
                borderRadius: '6px', padding: '3px 9px',
                fontSize: '9px', fontWeight: '700',
                color: selectedGig.type === 'physical' ? '#FF6B2B' : '#6C47FF'
              }}>
                {selectedGig.type === 'physical' ? '📌 PHYSICAL' : '💻 DIGITAL'}
              </span>
            </div>

            <h2 style={{
              fontSize: '20px', fontWeight: '800',
              color: '#14123A', marginBottom: '16px'
            }}>{selectedGig.title}</h2>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '10px', marginBottom: '14px'
            }}>
              <div style={{
                background: '#DFFDF4', border: '1.5px solid #7EECD2',
                borderRadius: '14px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '9px', color: '#00C48C', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Pay Range</div>
                <div style={{
                  fontSize: '22px', fontWeight: '800', color: '#00C48C'
                }}>${selectedGig.pay_min}</div>
                <div style={{ fontSize: '11px', color: '#00C48C', opacity: 0.7 }}>
                  up to ${selectedGig.pay_max}
                </div>
              </div>
              <div style={{
                background: '#FFF0E8', border: '1.5px solid #FFBC99',
                borderRadius: '14px', padding: '14px'
              }}>
                <div style={{
                  fontSize: '9px', color: '#FF6B2B', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px'
                }}>Location</div>
                <div style={{
                  fontSize: '13px', fontWeight: '700', color: '#14123A'
                }}>{selectedGig.location || 'Remote'}</div>
              </div>
            </div>

            {selectedGig.description && (
              <div style={{
                background: '#F5F4FF', borderRadius: '12px',
                padding: '14px', marginBottom: '14px',
                fontSize: '13px', color: '#5B5887', lineHeight: '1.6'
              }}>{selectedGig.description}</div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSelectedGig(null)}
                style={{
                  flex: 1, background: '#F5F4FF',
                  border: '1.5px solid #E2E0FF',
                  borderRadius: '12px', padding: '14px',
                  fontSize: '13px', fontWeight: '600',
                  color: '#8B8FAF', cursor: 'pointer', fontFamily: 'inherit'
                }}>Close</button>
              <button style={{
                flex: 2,
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(108,71,255,0.35)'
              }}>⚡ Apply for This Gig</button>
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