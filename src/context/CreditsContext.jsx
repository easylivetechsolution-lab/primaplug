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
      subscribeToCredits()
    }
  }, [user])

  const fetchCredits = async () => {
    if (!user) return
    const { data } = await supabase
      .from('prima_credits')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!data) {
      // Create credits record for new user
      const { data: newCredits } = await supabase
        .from('prima_credits')
        .insert({ user_id: user.id, balance: 0 })
        .select()
        .single()
      setCredits(newCredits)
    } else {
      setCredits(data)
    }
    setLoading(false)
  }

  const fetchCommissions = async () => {
    if (!user) return
    const { data } = await supabase
      .from('commissions')
      .select('*, gigs(title, currency)')
      .eq('worker_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setCommissions(data)
  }

  const subscribeToCredits = () => {
    const channel = supabase
      .channel('credits-' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'prima_credits',
        filter: `user_id=eq.${user.id}`
      }, () => fetchCredits())
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'commissions',
        filter: `worker_id=eq.${user.id}`
      }, () => fetchCommissions())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }

  const addCredits = async (amount, type, description, gigId = null) => {
    if (!user) return
    await supabase.rpc('add_credits', {
      p_user_id: user.id,
      p_amount: amount,
      p_type: type,
      p_description: description,
      p_gig_id: gigId
    })
    await fetchCredits()
  }

  const spendCredits = async (amount, type, description, gigId = null) => {
    if (!user) return false
    const { data } = await supabase.rpc('spend_credits', {
      p_user_id: user.id,
      p_amount: amount,
      p_type: type,
      p_description: description,
      p_gig_id: gigId
    })
    await fetchCredits()
    return data
  }

  const pendingCommissions = commissions.filter(c => c.status === 'pending')
  const totalOwed = pendingCommissions.reduce((sum, c) => sum + c.commission_amount, 0)
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