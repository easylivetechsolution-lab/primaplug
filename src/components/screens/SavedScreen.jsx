import BrandIcon from '../BrandIcon'

export default function SavedScreen() {
  return (
    <div style={{
      padding: '24px 20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ fontSize: '22px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
        Saved Gigs
      </div>
      <div style={{ fontSize: '13px', color: '#8B8FAF', marginBottom: '32px' }}>
        Gigs you bookmarked for later
      </div>
      <div style={{
        textAlign: 'center', padding: '48px 20px',
        background: '#fff', borderRadius: '16px',
        border: '1.5px solid #E2E0FF'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '14px'
        }}>
          <BrandIcon name="saved" size={48} />
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', color: '#14123A', marginBottom: '6px' }}>
          No saved gigs yet
        </div>
        <div style={{ fontSize: '13px', color: '#A09DC8' }}>
          Tap the bookmark icon on any gig to save it here
        </div>
      </div>
    </div>
  )
}
