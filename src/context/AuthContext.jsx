import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { initPushNotifications, listenForMessages } from '../utils/pushNotifications'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId) => {
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!data) {
        // New Google user — get their info from auth
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const googleName = authUser.user_metadata?.full_name || ''
          const googleAvatar = authUser.user_metadata?.avatar_url || ''
          const googleEmail = authUser.email || ''

          await supabase.from('users').insert({
            id: userId,
            full_name: googleName,
            email: googleEmail,
            avatar_url: googleAvatar,
            username: googleEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, ''),
            trust_score: 100,
            gigs_completed: 0,
            rating: 5.0,
          })
        }
      }

      setProfile(data)

      if (data) {
        try {
          await supabase.rpc('check_commission_status', {
            p_worker_id: userId
          })
        } catch (e) {
          console.log('Commission check error:', e)
        }
      }
    } catch (e) {
      console.log('Profile fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        setTimeout(() => initPushNotifications(session.user.id), 3000)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id)
          setTimeout(() => initPushNotifications(session.user.id), 3000)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}