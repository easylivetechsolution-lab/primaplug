import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from './AuthContext'

const CreditsContext = createContext({})
export const useCredits = () => useContext(CreditsContext)

export const CreditsProvider = ({ children }) => {
  const { user } = useAuth()
  const [credits, setCredits] = useState(null)
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchCredits()
      fetchCommissions()
    } else {
      setCredits(null)
      setCommissions([])
      setLoading(false)
    }
  }, [user])

  const fetchCredits = async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('prima_credits')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!data) {
        const { data: newCredits } = await supabase
          .from('prima_credits')
          .insert({ user_id: user.id, balance: 0, lifetime_earned: 0, lifetime_spent: 0 })
          .select()
          .single()
        setCredits(newCredits)
      } else {
        setCredits(data)
      }
    } catch (e) {
      console.log('Credits fetch error:', e)
    }
    setLoading(false)
  }

  const fetchCommissions = async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('commissions')
        .select('*, gigs(title, currency)')
        .eq('worker_id', user.id)
        .order('created_at', { ascending: false })
      if (data) setCommissions(data)
    } catch (e) {
      console.log('Commissions fetch error:', e)
    }
  }

  const addCredits = async (amount, type, description, gigId = null) => {
    if (!user) return
    try {
      await supabase.rpc('add_credits', {
        p_user_id: user.id,
        p_amount: amount,
        p_type: type,
        p_description: description,
        p_gig_id: gigId
      })
      await fetchCredits()
    } catch (e) {
      console.log('Add credits error:', e)
    }
  }

  const spendCredits = async (amount, type, description, gigId = null) => {
    if (!user) return false
    try {
      const { data } = await supabase.rpc('spend_credits', {
        p_user_id: user.id,
        p_amount: amount,
        p_type: type,
        p_description: description,
        p_gig_id: gigId
      })
      await fetchCredits()
      return data
    } catch (e) {
      console.log('Spend credits error:', e)
      return false
    }
  }

  const pendingCommissions = commissions.filter(c => c.status === 'pending')
  const totalOwed = pendingCommissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0)
  const hasUnpaidCommissions = pendingCommissions.length > 0

  return (
    <CreditsContext.Provider value={{
      credits,
      commissions,
      pendingCommissions,
      totalOwed,
      hasUnpaidCommissions,
      loading,
      addCredits,
      spendCredits,
      fetchCredits,
      fetchCommissions,
    }}>
      {children}
    </CreditsContext.Provider>
  )
}
