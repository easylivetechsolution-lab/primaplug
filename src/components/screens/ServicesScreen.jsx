import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PostService from '../PostService'
import ServiceDetail from '../ServiceDetail'
import EditService from '../EditService'
import PublicProfile from '../PublicProfile'
import { CATEGORIES } from '../../data/categories'
import ScreenLoader from '../ScreenLoader'

const PAGE_SIZE = 20

const SORT_OPTIONS = [
  { key: 'newest',    label: 'Newest First' },
  { key: 'price_asc', label: 'Price: Low → High' },
  { key: 'rating',    label: 'Top Rated' },
  { key: 'featured',  label: 'Featured First' },
]

const CAT_GRID = CATEGORIES.map(c => ({ group: c.group, icon: c.icon, color: c.color, bg: c.bg }))

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return `${Math.floor(d / 7)}w ago`
}

function lowestPrice(svc) {
  const prices = [svc.basic_price, svc.standard_price, svc.premium_price]
    .filter(p => p != null && Number(p) > 0)
    .map(Number)
  return prices.length ? Math.min(...prices) : null
}

export default function ServicesScreen() {
  const { user, wallets } = useAuth()

  // ── listings state ──────────────────────────────────────────────────────────
  const [featured,       setFeatured]       = useState([])
  const [services,       setServices]       = useState([])
  const [savedIds,       setSavedIds]       = useState(new Set())
  const [loading,        setLoading]        = useState(true)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [hasMore,        setHasMore]        = useState(true)
  const [page,           setPage]           = useState(0)

  // ── filter / sort state ─────────────────────────────────────────────────────
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searchInput,    setSearchInput]    = useState('')
  const [activeCategory, setActiveCategory] = useState(null)   // null = All
  const [typeFilter,     setTypeFilter]     = useState('all')
  const [sort,           setSort]           = useState('newest')
  const [showSort,       setShowSort]       = useState(false)

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showPost,         setShowPost]         = useState(false)
  const [selectedService,  setSelectedService]  = useState(null)
  const [viewingProfile,   setViewingProfile]   = useState(null)
  const [editingService,   setEditingService]   = useState(null)
  const [boostingService,  setBoostingService]  = useState(null)

  const observerRef  = useRef(null)
  const sentinelRef  = useRef(null)
  const searchTimer  = useRef(null)

  // ── debounced search ────────────────────────────────────────────────────────
  const handleSearchChange = (val) => {
    setSearchInput(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchQuery(val)
      resetAndFetch(val, activeCategory, typeFilter, sort)
    }, 350)
  }

  // ── fetch featured (always top, regardless of filters) ──────────────────────
  const fetchFeatured = async () => {
    const { data } = await supabase
      .from('services')
      .select('*, users(id, full_name, avatar_url, rating, level)')
      .eq('is_active', true)
      .eq('is_featured', true)
      .gt('featured_until', new Date().toISOString())
      .order('featured_until', { ascending: false })
      .limit(10)
    if (data) setFeatured(data)
  }

  // ── fetch saved ids ─────────────────────────────────────────────────────────
  const fetchSaved = async () => {
    if (!user) return
    const { data } = await supabase
      .from('saved_services')
      .select('service_id')
      .eq('user_id', user.id)
    if (data) setSavedIds(new Set(data.map(r => r.service_id)))
  }

  // ── paginated fetch ─────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (
    q = searchQuery, cat = activeCategory, type = typeFilter, s = sort, fromPage = 0
  ) => {
    if (fromPage === 0) setLoading(true)
    else setLoadingMore(true)

    try {
      let query = supabase
        .from('services')
        .select('*, users(id, full_name, avatar_url, rating, trust_score, level)')
        .eq('is_active', true)

      if (q.trim()) {
        query = query.or(
          `title.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%,field.ilike.%${q.trim()}%`
        )
      }
      if (cat) {
        const catDef = CATEGORIES.find(c => c.group === cat)
        if (catDef?.fields?.length) query = query.in('field', catDef.fields)
        else query = query.eq('field', cat)
      }
      if (type !== 'all') query = query.eq('type', type)

      if (s === 'price_asc') query = query.order('basic_price', { ascending: true })
      else if (s === 'rating') query = query.order('avg_rating', { ascending: false })
      else if (s === 'featured') {
        query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      query = query.range(fromPage * PAGE_SIZE, fromPage * PAGE_SIZE + PAGE_SIZE - 1)

      const { data } = await query
      const rows = data || []

      if (fromPage === 0) setServices(rows)
      else setServices(prev => [...prev, ...rows])

      setHasMore(rows.length === PAGE_SIZE)
      setPage(fromPage)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [searchQuery, activeCategory, typeFilter, sort])

  const resetAndFetch = (q, cat, type, s) => {
    setServices([])
    setPage(0)
    setHasMore(true)
    fetchPage(q, cat, type, s, 0)
  }

  // ── initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchFeatured()
    fetchSaved()
    fetchPage(searchQuery, activeCategory, typeFilter, sort, 0)
  }, [])

  // ── infinite scroll sentinel ────────────────────────────────────────────────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        fetchPage(searchQuery, activeCategory, typeFilter, sort, page + 1)
      }
    }, { threshold: 0.1 })
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [hasMore, loadingMore, loading, page, searchQuery, activeCategory, typeFilter, sort])

  // ── save / unsave toggle ────────────────────────────────────────────────────
  const toggleSave = async (e, serviceId) => {
    e.stopPropagation()
    if (!user) return
    const isSaved = savedIds.has(serviceId)
    setSavedIds(prev => {
      const next = new Set(prev)
      isSaved ? next.delete(serviceId) : next.add(serviceId)
      return next
    })
    if (isSaved) {
      await supabase.from('saved_services').delete()
        .eq('user_id', user.id).eq('service_id', serviceId)
    } else {
      await supabase.from('saved_services').insert({ user_id: user.id, service_id: serviceId })
    }
  }

  // ── filter change helpers ───────────────────────────────────────────────────
  const setCategory = (cat) => {
    const next = activeCategory === cat ? null : cat
    setActiveCategory(next)
    resetAndFetch(searchQuery, next, typeFilter, sort)
  }
  const setType = (t) => {
    setTypeFilter(t)
    resetAndFetch(searchQuery, activeCategory, t, sort)
  }
  const setAndApplySort = (s) => {
    setSort(s)
    setShowSort(false)
    resetAndFetch(searchQuery, activeCategory, typeFilter, s)
  }

  // ── styles ──────────────────────────────────────────────────────────────────
  const chip = (active, color = '#6C47FF', bg = '#EEE9FF') => ({
    border:       `1.5px solid ${active ? color : '#E2E0FF'}`,
    background:   active ? color : 'transparent',
    borderRadius: '20px',
    padding:      '5px 13px',
    fontSize:     '12px',
    fontWeight:   '600',
    color:        active ? '#fff' : '#8B8FAF',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
    fontFamily:   'inherit',
    flexShrink:   0,
  })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      background: '#F8F7FF',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: '1.5px solid #E2E0FF',
        flexShrink: 0, padding: '16px 20px 0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A' }}>Services</div>
            <div style={{ fontSize: '12px', color: '#8B8FAF' }}>Find talent or offer your skills</div>
          </div>
          <button onClick={() => setShowPost(true)} style={{
            background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: 'none', borderRadius: '12px',
            padding: '10px 16px', fontSize: '13px',
            fontWeight: '700', color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(108,71,255,0.35)',
          }}>+ Offer Service</button>
        </div>

        {/* Search + Sort row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search services, skills..."
              style={{
                width: '100%', background: '#F5F4FF',
                border: '1.5px solid #E2E0FF', borderRadius: '12px',
                padding: '10px 14px 10px 36px',
                fontSize: '13px', color: '#14123A',
                fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#B8A5FF'}
              onBlur={e => e.target.style.borderColor = '#E2E0FF'}
            />
            <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none' }}>🔍</span>
          </div>
          {/* Sort button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSort(v => !v)}
              style={{
                background: showSort ? '#EEE9FF' : '#F5F4FF',
                border: `1.5px solid ${showSort ? '#6C47FF' : '#E2E0FF'}`,
                borderRadius: '10px', padding: '9px 12px',
                fontSize: '13px', cursor: 'pointer',
                fontFamily: 'inherit', color: '#14123A',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
              ⇅ <span style={{ fontSize: '11px', color: '#8B8FAF' }}>{SORT_OPTIONS.find(o => o.key === sort)?.label.split(':')[0] || 'Sort'}</span>
            </button>
            {showSort && (
              <div style={{
                position: 'absolute', top: '40px', right: 0,
                background: '#fff', border: '1.5px solid #E2E0FF',
                borderRadius: '12px', zIndex: 100,
                boxShadow: '0 8px 24px rgba(20,18,58,0.12)',
                overflow: 'hidden', minWidth: '170px',
              }}>
                {SORT_OPTIONS.map(o => (
                  <button key={o.key} onClick={() => setAndApplySort(o.key)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px', fontSize: '13px',
                    background: sort === o.key ? '#EEE9FF' : 'transparent',
                    color: sort === o.key ? '#6C47FF' : '#14123A',
                    fontWeight: sort === o.key ? '700' : '500',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{o.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {[
            { key: 'all',      label: '✦ All' },
            { key: 'digital',  label: '💻 Digital' },
            { key: 'physical', label: '📌 Physical' },
          ].map(t => (
            <button key={t.key} onClick={() => setType(t.key)} style={chip(typeFilter === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 100px' }} onClick={() => setShowSort(false)}>

        {/* Category dropdown */}
        <CategoryDropdown
          categories={CAT_GRID}
          activeCategory={activeCategory}
          onSelect={setCategory}
        />

        {loading ? (
          <div style={{ paddingTop: '60px' }}><ScreenLoader /></div>
        ) : (
          <>
            {/* ── Featured row ───────────────────────────────────────────── */}
            {featured.length > 0 && !searchQuery && !activeCategory && (
              <div style={{ padding: '16px 0 0' }}>
                <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#14123A' }}>⚡ Featured</div>
                  <div style={{ fontSize: '11px', color: '#8B8FAF' }}>{featured.length} boosted</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '0 20px 12px', scrollbarWidth: 'none' }}>
                  {featured.map(svc => (
                    <FeaturedCard key={svc.id} svc={svc} savedIds={savedIds} toggleSave={toggleSave}
                      onOpen={() => setSelectedService(svc)} user={user}
                      onBoost={() => setBoostingService(svc)} />
                  ))}
                </div>
                <div style={{ height: '1px', background: '#F0EEFF', margin: '0 20px' }} />
              </div>
            )}

            {/* ── Main 2-col grid ────────────────────────────────────────── */}
            {services.length === 0 ? (
              <EmptyState
                hasFilters={!!(searchQuery || activeCategory || typeFilter !== 'all')}
                onClear={() => { setSearchInput(''); setSearchQuery(''); setActiveCategory(null); setTypeFilter('all'); resetAndFetch('', null, 'all', sort) }}
                onPost={() => setShowPost(true)}
              />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                padding: '14px 14px 0',
              }}>
                {services.map(svc => (
                  <ServiceCard
                    key={svc.id}
                    svc={svc}
                    savedIds={savedIds}
                    toggleSave={toggleSave}
                    onOpen={() => setSelectedService(svc)}
                    onEdit={() => setEditingService(svc)}
                    onBoost={() => setBoostingService(svc)}
                    user={user}
                  />
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loadingMore && <div style={{ fontSize: '12px', color: '#8B8FAF' }}>Loading more...</div>}
              {!hasMore && services.length > 0 && (
                <div style={{ fontSize: '11px', color: '#C0BDDA', padding: '8px' }}>You've seen it all</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showPost && (
        <PostService
          onClose={() => setShowPost(false)}
          onPosted={() => { setShowPost(false); fetchFeatured(); resetAndFetch(searchQuery, activeCategory, typeFilter, sort) }}
        />
      )}
      {selectedService && (
        <ServiceDetail
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onViewProfile={id => setViewingProfile(id)}
          savedIds={savedIds}
          toggleSave={toggleSave}
          onBoost={() => { setSelectedService(null); setBoostingService(selectedService) }}
        />
      )}
      {viewingProfile && (
        <PublicProfile userId={viewingProfile} onClose={() => setViewingProfile(null)} />
      )}
      {editingService && (
        <EditService
          service={editingService}
          onClose={() => setEditingService(null)}
          onUpdated={() => { setEditingService(null); resetAndFetch(searchQuery, activeCategory, typeFilter, sort) }}
        />
      )}
      {boostingService && (
        <BoostSheet
          service={boostingService}
          wallets={wallets || []}
          onClose={() => setBoostingService(null)}
          onBoosted={() => { setBoostingService(null); fetchFeatured(); resetAndFetch(searchQuery, activeCategory, typeFilter, sort) }}
          user={user}
        />
      )}
    </div>
  )
}

// ── Category dropdown ─────────────────────────────────────────────────────────

function CategoryDropdown({ categories, activeCategory, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = activeCategory ? categories.find(c => c.group === activeCategory) : null
  const label = selected ? `${selected.icon} ${selected.group}` : '✦ All Categories'

  return (
    <div ref={ref} style={{ background: '#fff', padding: '10px 20px', borderBottom: '1.5px solid #F0EEFF', position: 'relative', zIndex: 50 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: open ? '#EEE9FF' : '#F8F7FF',
          border: `1.5px solid ${activeCategory ? '#6C47FF' : '#E2E0FF'}`,
          borderRadius: '12px', padding: '9px 14px',
          fontSize: '13px', fontWeight: '600',
          color: activeCategory ? '#6C47FF' : '#14123A',
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}>
        <span>{label}</span>
        <span style={{ fontSize: '11px', color: '#A09DC8', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: '20px', right: '20px',
          background: '#fff', border: '1.5px solid #E2E0FF',
          borderRadius: '14px', boxShadow: '0 8px 24px rgba(20,18,58,0.12)',
          overflow: 'hidden', zIndex: 200, marginTop: '2px',
          maxHeight: '280px', overflowY: 'auto',
        }}>
          {/* All option */}
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px', border: 'none', cursor: 'pointer',
              background: activeCategory === null ? '#EEE9FF' : 'transparent',
              fontFamily: 'inherit', fontSize: '13px',
              fontWeight: activeCategory === null ? '700' : '500',
              color: activeCategory === null ? '#6C47FF' : '#14123A',
              borderBottom: '1px solid #F5F4FF',
            }}
            onMouseEnter={e => { if (activeCategory !== null) e.currentTarget.style.background = '#F8F7FF' }}
            onMouseLeave={e => { if (activeCategory !== null) e.currentTarget.style.background = 'transparent' }}>
            <span style={{ fontSize: '18px', width: '26px', textAlign: 'center' }}>✦</span>
            All Categories
          </button>
          {categories.map(cat => (
            <button
              key={cat.group}
              onClick={() => { onSelect(cat.group); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', border: 'none', cursor: 'pointer',
                background: activeCategory === cat.group ? cat.bg : 'transparent',
                fontFamily: 'inherit', fontSize: '13px',
                fontWeight: activeCategory === cat.group ? '700' : '500',
                color: activeCategory === cat.group ? cat.color : '#14123A',
                borderBottom: '1px solid #F5F4FF',
              }}
              onMouseEnter={e => { if (activeCategory !== cat.group) e.currentTarget.style.background = '#F8F7FF' }}
              onMouseLeave={e => { if (activeCategory !== cat.group) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: '18px', width: '26px', textAlign: 'center' }}>{cat.icon}</span>
              {cat.group}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Featured card (horizontal scroll) ────────────────────────────────────────

function FeaturedCard({ svc, savedIds, toggleSave, onOpen, user, onBoost }) {
  const isSaved = savedIds.has(svc.id)
  const price   = lowestPrice(svc)
  const cat     = CATEGORIES.find(c => c.fields?.includes(svc.field)) || CATEGORIES[0]
  const isOwn   = svc.worker_id === user?.id

  return (
    <div onClick={onOpen} style={{
      width: '200px', flexShrink: 0,
      background: '#fff', borderRadius: '14px',
      border: '1.5px solid #E2E0FF',
      overflow: 'hidden', cursor: 'pointer',
      boxShadow: '0 2px 12px rgba(108,71,255,0.08)',
      position: 'relative',
    }}>
      {/* Featured badge */}
      <div style={{
        position: 'absolute', top: '8px', left: '8px',
        background: 'linear-gradient(135deg, #FFB800, #FF6B2B)',
        borderRadius: '6px', padding: '2px 7px',
        fontSize: '9px', fontWeight: '800', color: '#fff', zIndex: 2,
      }}>⚡ Featured</div>

      {/* Save heart */}
      <button onClick={e => toggleSave(e, svc.id)} style={{
        position: 'absolute', top: '8px', right: '8px',
        background: 'rgba(255,255,255,0.9)', border: 'none',
        borderRadius: '50%', width: '28px', height: '28px',
        fontSize: '14px', cursor: 'pointer', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{isSaved ? '❤️' : '🤍'}</button>

      {/* Image */}
      <div style={{ height: '110px', background: cat.bg, overflow: 'hidden' }}>
        {svc.images?.[0]
          ? <img src={svc.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>{cat.icon}</div>
        }
      </div>

      <div style={{ padding: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#14123A', lineHeight: '1.3', marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {svc.title}
        </div>
        {price != null && (
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#6C47FF' }}>
            From {price.toLocaleString()}
          </div>
        )}
        <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '4px' }}>
          ⭐ {svc.avg_rating > 0 ? Number(svc.avg_rating).toFixed(1) : (svc.users?.rating || 5.0)} · {svc.users?.full_name?.split(' ')[0]}
        </div>
      </div>
    </div>
  )
}

// ── 2-col service card ────────────────────────────────────────────────────────

function ServiceCard({ svc, savedIds, toggleSave, onOpen, onEdit, onBoost, user }) {
  const isSaved  = savedIds.has(svc.id)
  const isOwn    = svc.worker_id === user?.id
  const price    = lowestPrice(svc)
  const cat      = CATEGORIES.find(c => c.fields?.includes(svc.field)) || CATEGORIES[0]
  const isFeatured = svc.is_featured && svc.featured_until && new Date(svc.featured_until) > new Date()

  return (
    <div onClick={onOpen} style={{
      background: '#fff', borderRadius: '14px',
      border: `1.5px solid ${isFeatured ? '#FFD966' : '#E2E0FF'}`,
      overflow: 'hidden', cursor: 'pointer',
      boxShadow: isFeatured
        ? '0 4px 16px rgba(255,184,0,0.15)'
        : '0 2px 8px rgba(20,18,58,0.05)',
      position: 'relative',
    }}>
      {/* Featured badge */}
      {isFeatured && (
        <div style={{
          position: 'absolute', top: '7px', left: '7px',
          background: 'linear-gradient(135deg, #FFB800, #FF6B2B)',
          borderRadius: '5px', padding: '2px 6px',
          fontSize: '8px', fontWeight: '800', color: '#fff', zIndex: 2,
        }}>⚡ Featured</div>
      )}

      {/* Save heart */}
      <button onClick={e => toggleSave(e, svc.id)} style={{
        position: 'absolute', top: '7px', right: '7px',
        background: 'rgba(255,255,255,0.85)', border: 'none',
        borderRadius: '50%', width: '26px', height: '26px',
        fontSize: '13px', cursor: 'pointer', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{isSaved ? '❤️' : '🤍'}</button>

      {/* Image / gradient header */}
      <div style={{ height: '110px', background: cat?.bg || '#EEE9FF', overflow: 'hidden', position: 'relative' }}>
        {svc.images?.[0]
          ? <img src={svc.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px' }}>{cat?.icon || '🛠'}</div>
        }
        {/* Type badge bottom-left */}
        <div style={{
          position: 'absolute', bottom: '6px', left: '6px',
          background: svc.type === 'digital' ? 'rgba(108,71,255,0.85)' : 'rgba(255,107,43,0.85)',
          borderRadius: '4px', padding: '2px 6px',
          fontSize: '8px', fontWeight: '700', color: '#fff',
        }}>{svc.type === 'digital' ? '💻' : '📌'} {svc.type === 'digital' ? 'Digital' : 'Physical'}</div>
      </div>

      <div style={{ padding: '10px' }}>
        {/* Title */}
        <div style={{
          fontSize: '12px', fontWeight: '700', color: '#14123A',
          lineHeight: '1.35', marginBottom: '5px',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{svc.title}</div>

        {/* Price */}
        {price != null && (
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#6C47FF', marginBottom: '6px' }}>
            From {price.toLocaleString()}
          </div>
        )}

        {/* Rating */}
        {(svc.avg_rating > 0 || svc.review_count > 0) && (
          <div style={{ fontSize: '10px', color: '#FFB800', marginBottom: '4px' }}>
            ⭐ {Number(svc.avg_rating || 0).toFixed(1)}
            <span style={{ color: '#A09DC8' }}> ({svc.review_count})</span>
          </div>
        )}

        {/* Seller + time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #F5F4FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '5px',
              background: '#EEE9FF', overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', fontWeight: '800', color: '#6C47FF',
            }}>
              {svc.users?.avatar_url
                ? <img src={svc.users.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : svc.users?.full_name?.charAt(0) || '?'
              }
            </div>
            <div style={{ fontSize: '10px', color: '#8B8FAF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {svc.users?.full_name?.split(' ')[0] || 'Unknown'}
            </div>
          </div>
          <div style={{ fontSize: '9px', color: '#C0BDDA', flexShrink: 0 }}>
            {svc.location ? `📍 ${svc.location.split(',')[0]}` : timeAgo(svc.created_at)}
          </div>
        </div>

        {/* Owner actions */}
        {isOwn && (
          <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
            <button onClick={e => { e.stopPropagation(); onEdit() }} style={{
              flex: 1, background: '#F5F4FF', border: '1.5px solid #E2E0FF',
              borderRadius: '7px', padding: '5px', fontSize: '10px',
              fontWeight: '700', color: '#6C47FF', cursor: 'pointer', fontFamily: 'inherit',
            }}>✏️ Edit</button>
            <button onClick={e => { e.stopPropagation(); onBoost() }} style={{
              flex: 1, background: '#FFF8E0', border: '1.5px solid #FFD966',
              borderRadius: '7px', padding: '5px', fontSize: '10px',
              fontWeight: '700', color: '#FFB800', cursor: 'pointer', fontFamily: 'inherit',
            }}>⚡ Boost</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasFilters, onClear, onPost }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 32px' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>{hasFilters ? '🔍' : '🛠'}</div>
      <div style={{ fontSize: '16px', fontWeight: '800', color: '#14123A', marginBottom: '6px' }}>
        {hasFilters ? 'No services found' : 'No services yet'}
      </div>
      <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '20px', lineHeight: '1.6' }}>
        {hasFilters
          ? 'Try a different search or clear your filters.'
          : 'Be the first to offer a service others can book.'}
      </div>
      <button onClick={hasFilters ? onClear : onPost} style={{
        background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
        border: 'none', borderRadius: '12px', padding: '12px 24px',
        fontSize: '13px', fontWeight: '700', color: '#fff',
        cursor: 'pointer', fontFamily: 'inherit',
      }}>{hasFilters ? 'Clear Filters' : 'Offer a Service'}</button>
    </div>
  )
}

// ── Boost sheet ───────────────────────────────────────────────────────────────

const BOOST_PLANS = [
  { days: 7,  label: '7 Days',  desc: 'Quick visibility boost' },
  { days: 14, label: '14 Days', desc: 'Best value' },
  { days: 30, label: '30 Days', desc: 'Maximum exposure' },
]

const BOOST_PRICES = {
  NGN: { 7: 1500, 14: 2500, 30: 4000 },
  USD: { 7: 1.00, 14: 2.00, 30: 3.00 },
  GHS: { 7: 15,   14: 25,   30: 40   },
  KES: { 7: 130,  14: 220,  30: 350  },
}

function BoostSheet({ service, wallets, onClose, onBoosted, user }) {
  const [selectedDays,  setSelectedDays]  = useState(14)
  const [selectedCur,   setSelectedCur]   = useState(() => wallets[0]?.currency || 'NGN')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState(false)

  const wallet      = wallets.find(w => w.currency === selectedCur)
  const walletBal   = Number(wallet?.balance || 0)
  const price       = BOOST_PRICES[selectedCur]?.[selectedDays] ?? 0
  const canPayWallet = walletBal >= price

  const payWithWallet = async () => {
    setError('')
    setLoading(true)
    try {
      const { error: rpcErr } = await supabase.rpc('activate_service_boost', {
        p_service_id: service.id,
        p_days:       selectedDays,
        p_currency:   selectedCur,
      })
      if (rpcErr) throw rpcErr
      setSuccess(true)
      setTimeout(onBoosted, 1800)
    } catch (e) {
      setError(e.message || 'Failed to activate boost')
    }
    setLoading(false)
  }

  const payWithFincra = async () => {
    setError('')
    setLoading(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('fincra-boost-service', {
        body: {
          serviceId:   service.id,
          days:        selectedDays,
          currency:    selectedCur,
          email:       user.email,
          serviceName: service.title,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      window.location.href = data.checkoutUrl
    } catch (e) {
      setError(e.message || 'Failed to start payment')
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.75)', backdropFilter: 'blur(4px)',
      zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '22px 22px 0 0',
        width: '100%', maxWidth: '540px',
        padding: '20px', paddingBottom: '36px',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: '40px', height: '4px', background: '#E2E0FF', borderRadius: '2px', margin: '0 auto 20px' }} />

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚡</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#FFB800', marginBottom: '6px' }}>Service Boosted!</div>
            <div style={{ fontSize: '13px', color: '#8B8FAF' }}>Your service is now featured for {selectedDays} days.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>⚡ Boost Service</div>
            <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '20px' }}>
              Feature <strong>"{service.title}"</strong> at the top of the marketplace
            </div>

            {/* Duration picker */}
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Duration</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {BOOST_PLANS.map(plan => (
                <button key={plan.days} onClick={() => setSelectedDays(plan.days)} style={{
                  flex: 1, padding: '12px 6px',
                  background: selectedDays === plan.days ? '#FFF8E0' : '#F5F4FF',
                  border: `1.5px solid ${selectedDays === plan.days ? '#FFB800' : '#E2E0FF'}`,
                  borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: selectedDays === plan.days ? '#FFB800' : '#14123A' }}>{plan.label}</div>
                  <div style={{ fontSize: '10px', color: '#A09DC8', marginTop: '2px' }}>{plan.desc}</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: selectedDays === plan.days ? '#FFB800' : '#6C47FF', marginTop: '4px' }}>
                    {selectedCur} {(BOOST_PRICES[selectedCur]?.[plan.days] || 0).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>

            {/* Currency picker (only if multiple wallets) */}
            {wallets.length > 0 && (
              <>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#8B8FAF', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Pay Currency</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {['NGN', 'USD', 'GHS', 'KES'].filter(c => BOOST_PRICES[c]).map(c => {
                    const w = wallets.find(w => w.currency === c)
                    return (
                      <button key={c} onClick={() => setSelectedCur(c)} style={{
                        padding: '7px 12px',
                        background: selectedCur === c ? '#EEE9FF' : '#F5F4FF',
                        border: `1.5px solid ${selectedCur === c ? '#6C47FF' : '#E2E0FF'}`,
                        borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: '12px', fontWeight: '700',
                        color: selectedCur === c ? '#6C47FF' : '#8B8FAF',
                      }}>
                        {c}{w ? ` (${Number(w.balance).toLocaleString()})` : ''}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Price summary */}
            <div style={{
              background: '#F8F7FF', border: '1.5px solid #E2E0FF',
              borderRadius: '12px', padding: '14px', marginBottom: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '12px', color: '#8B8FAF' }}>Total cost</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#14123A' }}>
                  {selectedCur} {price.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#8B8FAF' }}>Your wallet</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: canPayWallet ? '#00C48C' : '#FF3366' }}>
                  {selectedCur} {walletBal.toLocaleString()}
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 12px',
                fontSize: '12px', color: '#FF3366', fontWeight: '600', marginBottom: '14px',
              }}>{error}</div>
            )}

            {/* Pay buttons */}
            {canPayWallet && (
              <button onClick={payWithWallet} disabled={loading} style={{
                width: '100%', marginBottom: '10px',
                background: loading ? '#B8A5FF' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '12px', padding: '14px',
                fontSize: '14px', fontWeight: '700', color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {loading ? 'Activating...' : `⚡ Pay from Wallet — ${selectedCur} ${price.toLocaleString()}`}
              </button>
            )}

            <button onClick={payWithFincra} disabled={loading} style={{
              width: '100%',
              background: 'transparent',
              border: '1.5px solid #6C47FF',
              borderRadius: '12px', padding: '13px',
              fontSize: '13px', fontWeight: '700', color: '#6C47FF',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {canPayWallet ? 'Pay with Fincra instead →' : `Pay with Fincra — ${selectedCur} ${price.toLocaleString()} →`}
            </button>

            <div style={{ fontSize: '11px', color: '#A09DC8', textAlign: 'center', marginTop: '10px' }}>
              🔒 Your service will appear at the top of the marketplace during the boost period
            </div>
          </>
        )}
      </div>
    </div>
  )
}
