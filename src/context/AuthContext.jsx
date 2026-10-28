import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { initPushNotifications, listenForMessages } from '../utils/pushNotifications'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileLoadError, setProfileLoadError] = useState('')

  const fetchProfile = async (userId) => {
    if (!userId) return false
    setProfileLoaded(false)
    setProfileLoadError('')
    try {
      const [{ data: profileData, error }, { data: walletsData, error: walletsError }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        supabase.from('wallets').select('*').eq('user_id', userId).order('created_at'),
      ])

      if (error) {
        console.log('Profile fetch error:', error)
        setProfileLoadError('We could not load your profile. Please try again.')
        return false
      }

      setProfile(profileData)
      setWallets(walletsData || [])
      if (walletsError) console.log('Wallet fetch error:', walletsError)
      return true
    } catch (e) {
      console.log('Profile fetch exception:', e)
      setProfileLoadError('We could not load your profile. Please try again.')
      return false
    } finally {
      setProfileLoaded(true)
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setProfileLoaded(false)
        fetchProfile(session.user.id)
        setTimeout(() => initPushNotifications(session.user.id), 3000)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // getSession() above owns initial profile loading. Ignore the matching
        // INITIAL_SESSION event so it cannot race a second profile fetch.
        if (event === 'INITIAL_SESSION') return
        setUser(session?.user ?? null)
        if (session?.user) {
          if (event !== 'TOKEN_REFRESHED') {
            setProfileLoaded(false)
            fetchProfile(session.user.id)
          }
          if (event === 'SIGNED_IN') {
            setTimeout(() => initPushNotifications(session.user.id), 3000)
          }
        } else {
          setProfile(null)
          setWallets([])
          setProfileLoadError('')
          setProfileLoaded(false)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const refreshProfile = (userId = user?.id) => {
    if (userId) return fetchProfile(userId)
    return Promise.resolve()
  }

  return (
    <AuthContext.Provider value={{ user, profile, wallets, loading, profileLoaded, profileLoadError, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
