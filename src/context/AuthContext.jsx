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

  const fetchProfile = async (userId) => {
    if (!userId) return
    try {
      const [{ data: profileData, error }, { data: walletsData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        supabase.from('wallets').select('*').eq('user_id', userId).order('created_at'),
      ])

      if (error) {
        console.log('Profile fetch error:', error)
        return
      }

      setProfile(profileData)
      setWallets(walletsData || [])
    } catch (e) {
      console.log('Profile fetch exception:', e)
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
          setProfileLoaded(false)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const refreshProfile = () => {
    if (user?.id) fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, wallets, loading, profileLoaded, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
