import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import Layout from '../components/Layout'

export default function Dashboard() {
  const { user } = useAuth()

  if (!user) return null

  return <Layout />
}