import { useState } from 'react'
import { CATEGORIES } from '../data/categories'

export default function CategoryPicker({ selected, onSelect, customSkill, onCustomSkill }) {
  const [openGroup, setOpenGroup] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = search.length > 1
    ? CATEGORIES.map(cat => ({
        ...cat,
        fields: cat.fields.filter(f =>
          f.toLowerCase().includes(search.toLowerCase())
        )
      })).filter(cat => cat.fields.length > 0)
    : CATEGORIES

  return (
    <div>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <input
          placeholder="Search any field or profession..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: '#F5F4FF',
            border: '1.5px solid #E2E0FF', borderRadius: '10px',
            padding: '11px 14px 11px 38px',
            fontSize: '13px', color: '#14123A',
            fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box', transition: 'border-color 0.15s'
          }}
          onFocus={e => e.target.style.borderColor = '#B8A5FF'}
          onBlur={e => e.target.style.borderColor = '#E2E0FF'}
        />
        <span style={{
          position: 'absolute', left: '12px',
          top: '50%', transform: 'translateY(-50%)',
          fontSize: '15px', pointerEvents: 'none'
        }}>🔍</span>
        {search && (
          <span
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: '12px',
              top: '50%', transform: 'translateY(-50%)',
              fontSize: '16px', color: '#A09DC8', cursor: 'pointer'
            }}>×</span>
        )}
      </div>

      {/* Selected display */}
      {selected && (
        <div style={{
          background: '#EEE9FF', border: '1.5px solid #B8A5FF',
          borderRadius: '10px', padding: '10px 14px',
          marginBottom: '12px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: '#A09DC8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
              Selected
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#6C47FF' }}>
              ✓ {selected}
            </div>
          </div>
          <button
            onClick={() => { onSelect(''); onCustomSkill && onCustomSkill('') }}
            style={{
              background: 'none', border: 'none',
              fontSize: '16px', color: '#A09DC8',
              cursor: 'pointer', fontFamily: 'inherit'
            }}>×</button>
        </div>
      )}

      {/* Category groups */}
      <div style={{
        maxHeight: '320px', overflowY: 'auto',
        border: '1.5px solid #E2E0FF', borderRadius: '12px',
        overflow: 'hidden'
      }}>
        {filtered.map((cat, ci) => (
          <div key={cat.group} style={{
            borderBottom: ci < filtered.length - 1 ? '1px solid #F5F4FF' : 'none'
          }}>
            {/* Group header */}
            <div
              onClick={() => setOpenGroup(openGroup === cat.group ? null : cat.group)}
              style={{
                padding: '12px 14px',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', cursor: 'pointer',
                background: openGroup === cat.group ? cat.bg : '#fff',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = cat.bg}
              onMouseLeave={e => e.currentTarget.style.background = openGroup === cat.group ? cat.bg : '#fff'}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '18px' }}>{cat.icon}</span>
                <span style={{
                  fontSize: '13px', fontWeight: '700',
                  color: openGroup === cat.group ? cat.color : '#14123A'
                }}>{cat.group}</span>
                <span style={{
                  background: cat.bg, border: `1px solid ${cat.border}`,
                  borderRadius: '20px', padding: '1px 7px',
                  fontSize: '10px', fontWeight: '600', color: cat.color
                }}>{cat.fields.length}</span>
              </div>
              <span style={{
                fontSize: '12px', color: '#A09DC8',
                transition: 'transform 0.2s',
                transform: openGroup === cat.group ? 'rotate(180deg)' : 'rotate(0)'
              }}>▼</span>
            </div>

            {/* Fields list */}
            {(openGroup === cat.group || search.length > 1) && (
              <div style={{ background: '#FAFAFF' }}>
                {cat.fields.map(field => (
                  <div
                    key={field}
                    onClick={() => {
                      onSelect(field)
                      setSearch('')
                      setOpenGroup(null)
                    }}
                    style={{
                      padding: '10px 14px 10px 44px',
                      cursor: 'pointer', fontSize: '13px',
                      color: selected === field ? cat.color : '#5B5887',
                      fontWeight: selected === field ? '700' : '400',
                      background: selected === field ? cat.bg : 'transparent',
                      borderTop: '1px solid #F5F4FF',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => {
                      if (selected !== field) e.currentTarget.style.background = cat.bg + '88'
                    }}
                    onMouseLeave={e => {
                      if (selected !== field) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {field}
                    {selected === field && (
                      <span style={{ color: cat.color, fontSize: '14px' }}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Custom skill input */}
      {selected && onCustomSkill && (
        <div style={{ marginTop: '12px' }}>
          <label style={{
            fontSize: '10px', fontWeight: '700', color: '#8B8FAF',
            textTransform: 'uppercase', letterSpacing: '0.8px',
            display: 'block', marginBottom: '6px'
          }}>
            Specific Skill / Title (optional)
          </label>
          <input
            placeholder={`e.g. React Developer, Wedding Photographer, Tax Accountant...`}
            value={customSkill || ''}
            onChange={e => onCustomSkill(e.target.value)}
            style={{
              width: '100%', background: '#F5F4FF',
              border: '1.5px solid #E2E0FF', borderRadius: '10px',
              padding: '11px 14px', fontSize: '13px',
              color: '#14123A', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s'
            }}
            onFocus={e => e.target.style.borderColor = '#B8A5FF'}
            onBlur={e => e.target.style.borderColor = '#E2E0FF'}
          />
          <div style={{
            fontSize: '10px', color: '#A09DC8', marginTop: '5px'
          }}>
            💡 This helps people find exactly what you offer
          </div>
        </div>
      )}
    </div>
  )
}