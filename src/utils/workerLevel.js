import { supabase } from '../supabase'

export const updateWorkerLevel = async (workerId) => {
  const { data } = await supabase
    .from('users').select('gigs_completed').eq('id', workerId).single()
  const count = data?.gigs_completed || 0
  let level = 'new'
  let level_progress = Math.floor((count / 3) * 100)
  if (count >= 25)      { level = 'elite';  level_progress = 100 }
  else if (count >= 10) { level = 'pro';    level_progress = Math.floor(((count - 10) / 15) * 100) }
  else if (count >= 3)  { level = 'rising'; level_progress = Math.floor(((count - 3) / 7) * 100) }
  await supabase.from('users').update({ level, level_progress }).eq('id', workerId)
}
